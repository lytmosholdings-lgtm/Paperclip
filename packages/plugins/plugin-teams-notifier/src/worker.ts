import { definePlugin, runWorker, type PluginContext, type PluginEvent } from "@paperclipai/plugin-sdk";
import { buildTeamsMessage, teamsBotChatUrl, type Notification, type NotificationKind } from "./cards.js";
import { agentMatches, botAppIdForAgent, parseConfig, type TeamsNotifierConfig } from "./config.js";

const STATUS_KINDS: Record<string, { kind: NotificationKind; enabled: (config: TeamsNotifierConfig) => boolean }> = {
  done: { kind: "completed", enabled: (config) => config.notifyCompleted },
  in_review: { kind: "in_review", enabled: (config) => config.notifyInReview },
  blocked: { kind: "blocked", enabled: (config) => config.notifyBlocked },
};

const APPROVAL_LABELS: Record<string, string> = {
  hire_agent: "Hire a new agent",
  approve_ceo_strategy: "Approve the CEO's strategy",
  budget_override_required: "Budget override required",
  request_board_approval: "Board approval requested",
};

const RESOLVER_LABELS: Record<string, string> = {
  anyone: "You or any agent",
  not_creator: "You or another agent",
  human_only: "Board only",
  board_or_agents: "You or any agent",
  board_only: "Board only",
};

const LAST_STATUS_KEY = "last-notified-status";
const RELAYED_KEY = "relayed-to-board";

type Payload = Record<string, unknown>;

function asRecord(value: unknown): Payload {
  return value && typeof value === "object" ? (value as Payload) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatCents(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `$${(value / 100).toFixed(2)}` : null;
}

function humanize(value: string): string {
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type AgentRef = { id: string; name: string };

interface Context {
  ctx: PluginContext;
  config: TeamsNotifierConfig;
  companyId: string;
  officer: AgentRef | null;
}

async function loadConfig(ctx: PluginContext, companyId: string): Promise<TeamsNotifierConfig | null> {
  const config = parseConfig(await ctx.config.get(companyId));
  return config.workflowUrl ? config : null;
}

async function resolveOfficer(ctx: PluginContext, config: TeamsNotifierConfig, companyId: string): Promise<AgentRef | null> {
  if (!config.officerAgent) return null;
  const agents = await ctx.agents.list({ companyId });
  const officer = agents.find((agent) => agentMatches(config.officerAgent, agent));
  return officer ? { id: officer.id, name: officer.name } : null;
}

/** The officer's own tasks (its Teams conversations and relayed messages) already reach Teams. */
function isOfficerTask(c: Context, issue: { assigneeAgentId: string | null }): boolean {
  return c.officer !== null && issue.assigneeAgentId === c.officer.id;
}

async function agentFor(c: Context, agentId: string | null | undefined) {
  if (!agentId) return null;
  const agent = await c.ctx.agents.get(agentId, c.companyId);
  return agent ? { id: agent.id, name: agent.name } : null;
}

async function companyPath(c: Context): Promise<string> {
  const company = await c.ctx.companies.get(c.companyId);
  return company?.issuePrefix ? `${c.config.boardUrl}/${company.issuePrefix}` : c.config.boardUrl;
}

async function issueUrl(c: Context, issueRef: string): Promise<string> {
  return `${await companyPath(c)}/issues/${encodeURIComponent(issueRef)}`;
}

function replyUrl(c: Context, agent: AgentRef | null, reference: string | null): string | null {
  // With an officer, every reply goes through it; otherwise to the agent's own bot.
  const botAppId = botAppIdForAgent(c.config, c.officer ?? agent);
  if (!botAppId) return null;
  return teamsBotChatUrl(botAppId, reference ? `Re ${reference}: ` : "");
}

async function send(c: Context, notification: Notification): Promise<void> {
  // Never log the workflow URL: it is a bearer credential for the Teams chat.
  try {
    const response = await c.ctx.http.fetch(c.config.workflowUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildTeamsMessage(notification)),
    });
    if (!response.ok) {
      c.ctx.logger.warn("Teams workflow rejected notification", { status: response.status, kind: notification.kind });
    }
  } catch (error) {
    c.ctx.logger.warn("Teams workflow request failed", {
      kind: notification.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function onInteractionCreated(c: Context, event: PluginEvent): Promise<void> {
  if (!c.config.notifyQuestions || !event.entityId) return;
  const payload = asRecord(event.payload);
  const interactionId = asString(payload.interactionId);
  const issue = await c.ctx.issues.get(event.entityId, c.companyId);
  if (!issue || isOfficerTask(c, issue)) return;
  const interactions = await c.ctx.issues.listInteractions(issue.id, c.companyId);
  const interaction = interactions.find((candidate) => candidate.id === interactionId);
  // Agent-to-agent handoffs are not decisions for a person.
  if (interaction?.addresseeAgentId && !interaction.addresseeUserId) return;
  if (interaction && interaction.status !== "pending") return;
  const agent = await agentFor(c, interaction?.createdByAgentId ?? asString(payload.agentId) ?? issue.assigneeAgentId);
  const reference = issue.identifier ?? issue.id;
  await send(c, {
    kind: "question",
    title: interaction?.title ?? issue.title,
    agentName: agent?.name,
    taskLabel: `${reference} · ${issue.title}`,
    decider: interaction?.addresseeUserId
      ? "Board only"
      : RESOLVER_LABELS[interaction?.effectiveResolverPolicy ?? "anyone"] ?? null,
    body: interaction?.summary ?? null,
    openUrl: await issueUrl(c, reference),
    replyUrl: replyUrl(c, agent, reference),
  });
}

async function onApprovalCreated(c: Context, event: PluginEvent): Promise<void> {
  if (!c.config.notifyApprovals || !event.entityId) return;
  const approval = await c.ctx.approvals.get(event.entityId, c.companyId);
  if (!approval || approval.status !== "pending") return;
  const agent = await agentFor(c, approval.requestedByAgentId);
  const details = asRecord(approval.payload);
  const summary = asString(details.title) ?? asString(details.summary) ?? asString(details.name);
  await send(c, {
    kind: "approval",
    title: summary ?? APPROVAL_LABELS[approval.type] ?? humanize(approval.type),
    agentName: agent?.name,
    decider: "Board only",
    body: summary ? (APPROVAL_LABELS[approval.type] ?? humanize(approval.type)) : null,
    openUrl: `${await companyPath(c)}/approvals/${encodeURIComponent(approval.id)}`,
    replyUrl: replyUrl(c, agent, `approval ${approval.id.slice(0, 8)}`),
  });
}

async function onIssueUpdated(c: Context, event: PluginEvent): Promise<void> {
  if (!event.entityId) return;
  const payload = asRecord(event.payload);
  const status = asString(payload.status);
  // Only react when this update set the status; other edits repeat it.
  if (!status) return;
  const previous = asString(asRecord(payload._previous).status);
  if (previous === status) return;
  const target = STATUS_KINDS[status];
  if (!target || !target.enabled(c.config)) return;

  const issue = await c.ctx.issues.get(event.entityId, c.companyId);
  if (!issue || isOfficerTask(c, issue)) return;
  const scope = { scopeKind: "issue" as const, scopeId: event.entityId, stateKey: LAST_STATUS_KEY };
  if ((await c.ctx.state.get(scope)) === status) return;
  await c.ctx.state.set(scope, status);

  const agent = await agentFor(c, asString(payload.agentId) ?? issue.assigneeAgentId);
  const reference = issue.identifier ?? issue.id;
  await send(c, {
    kind: target.kind,
    title: issue.title,
    agentName: agent?.name,
    taskLabel: reference,
    openUrl: await issueUrl(c, reference),
    replyUrl: replyUrl(c, agent, reference),
  });
}

/** Relays a task another agent assigned to the officer, once, as a message for the board. */
async function onOfficerInbox(c: Context, event: PluginEvent): Promise<void> {
  if (!c.officer || !c.config.notifyOfficerInbox || !event.entityId) return;
  const issue = await c.ctx.issues.get(event.entityId, c.companyId);
  if (!issue || !isOfficerTask(c, issue)) return;
  // Only agent-raised items: the officer's Teams conversations come from people.
  if (!issue.createdByAgentId || issue.createdByAgentId === c.officer.id) return;
  const scope = { scopeKind: "issue" as const, scopeId: issue.id, stateKey: RELAYED_KEY };
  if (await c.ctx.state.get(scope)) return;
  await c.ctx.state.set(scope, true);

  const sender = await agentFor(c, issue.createdByAgentId);
  const reference = issue.identifier ?? issue.id;
  await send(c, {
    kind: "message",
    title: issue.title,
    agentName: sender?.name,
    taskLabel: reference,
    body: issue.description,
    openUrl: await issueUrl(c, reference),
    replyUrl: replyUrl(c, sender, reference),
  });
}

async function onCommentCreated(c: Context, event: PluginEvent): Promise<void> {
  if (!c.config.notifyAgentComments || event.actorType !== "agent") return;
  const payload = asRecord(event.payload);
  const issueId = event.entityType === "issue" ? event.entityId : asString(payload.issueId);
  if (!issueId) return;
  const issue = await c.ctx.issues.get(issueId, c.companyId);
  if (!issue || isOfficerTask(c, issue)) return;
  const agent = await agentFor(c, asString(payload.agentId) ?? event.actorId);
  const reference = issue.identifier ?? issue.id;
  await send(c, {
    kind: "comment",
    title: issue.title,
    agentName: agent?.name,
    taskLabel: reference,
    body: asString(payload.bodySnippet),
    openUrl: await issueUrl(c, reference),
    replyUrl: replyUrl(c, agent, reference),
  });
}

async function onBudgetIncident(c: Context, event: PluginEvent): Promise<void> {
  if (!c.config.notifyBudget) return;
  const payload = asRecord(event.payload);
  const observed = formatCents(payload.amountObserved);
  const limit = formatCents(payload.amountLimit);
  const scope = asString(payload.scopeName) ?? (asString(payload.scopeType) ? humanize(String(payload.scopeType)) : null);
  const hard = asString(payload.thresholdType) === "hard";
  await send(c, {
    kind: "budget",
    title: hard ? "Budget limit reached — work is paused" : "Budget warning threshold crossed",
    body: [scope, observed && limit ? `${observed} spent of ${limit}` : null].filter(Boolean).join(" · ") || null,
    openUrl: `${await companyPath(c)}/costs`,
  });
}

async function onRunFailed(c: Context, event: PluginEvent): Promise<void> {
  if (!c.config.notifyRunFailures) return;
  const payload = asRecord(event.payload);
  const agent = await agentFor(c, asString(payload.agentId));
  const issueId = asString(payload.issueId);
  const issue = issueId ? await c.ctx.issues.get(issueId, c.companyId) : null;
  if (issue && isOfficerTask(c, issue)) return;
  const reference = issue ? (issue.identifier ?? issue.id) : null;
  await send(c, {
    kind: "run_failed",
    title: issue?.title ?? `${agent?.name ?? "An agent"}'s run failed`,
    agentName: agent?.name,
    taskLabel: reference,
    body: asString(payload.error) ?? asString(payload.errorCode),
    openUrl: reference ? await issueUrl(c, reference) : await companyPath(c),
  });
}

const HANDLERS: Array<[Parameters<PluginContext["events"]["on"]>[0], (c: Context, event: PluginEvent) => Promise<void>]> = [
  ["issue.created", onOfficerInbox],
  ["issue.updated", onOfficerInbox],
  ["issue.interaction.created", onInteractionCreated],
  ["approval.created", onApprovalCreated],
  ["issue.updated", onIssueUpdated],
  ["issue.comment.created", onCommentCreated],
  ["budget.incident.opened", onBudgetIncident],
  ["agent.run.failed", onRunFailed],
];

const plugin = definePlugin({
  async setup(ctx) {
    for (const [eventType, handler] of HANDLERS) {
      ctx.events.on(eventType, async (event) => {
        const config = await loadConfig(ctx, event.companyId);
        if (!config) return;
        const officer = await resolveOfficer(ctx, config, event.companyId);
        await handler({ ctx, config, companyId: event.companyId, officer }, event);
      });
    }
    ctx.logger.info("Teams notifier ready");
  },

  async onHealth() {
    return { status: "ok", message: "Teams notifier ready" };
  },

  async onIdleDrain() {
    return "none";
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
