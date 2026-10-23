import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";

type Seed = Parameters<TestHarness["seed"]>[0];
type Company = NonNullable<Seed["companies"]>[number];
type Agent = NonNullable<Seed["agents"]>[number];
type Issue = NonNullable<Seed["issues"]>[number];
type Approval = NonNullable<Seed["approvals"]>[number];
type IssueThreadInteraction = NonNullable<Seed["issueInteractions"]>[number];
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { buildTeamsMessage, teamsBotChatUrl, truncate } from "../src/cards.js";
import { botAppIdForAgent, parseConfig } from "../src/config.js";

const companyId = "00000000-0000-4000-8000-000000000001";
const agentId = "00000000-0000-4000-8000-000000000002";
const issueId = "00000000-0000-4000-8000-000000000003";
const approvalId = "00000000-0000-4000-8000-000000000004";
const interactionId = "00000000-0000-4000-8000-000000000005";
const botAppId = "11111111-2222-4333-8444-555555555555";
const workflowUrl = "https://example.invalid/workflows/abc?sig=secret";

const company = { id: companyId, name: "Vitavera", issuePrefix: "VIT" } as unknown as Company;
const agent = { id: agentId, companyId, name: "CEO" } as unknown as Agent;
const issue = {
  id: issueId,
  companyId,
  identifier: "VIT-42",
  title: "Draft Q4 supplier plan",
  status: "in_progress",
  assigneeAgentId: agentId,
} as unknown as Issue;

type Card = {
  attachments: Array<{ content: { body: Array<Record<string, unknown>>; actions?: Array<Record<string, unknown>> } }>;
};

let posted: Card[];
let fetchMock: ReturnType<typeof vi.fn>;

async function setup(config: Record<string, unknown> = {}) {
  const harness = createTestHarness({
    manifest,
    config: { workflowUrl, agentBots: [{ agent: "ceo", botAppId }], ...config },
  });
  harness.seed({ companies: [company], agents: [agent], issues: [issue] });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

function texts(card: Card): string[] {
  return card.attachments[0].content.body.flatMap((block) => {
    if (block.type === "TextBlock") return [String(block.text)];
    if (block.type === "FactSet") {
      return (block.facts as Array<{ title: string; value: string }>).map((fact) => `${fact.title}: ${fact.value}`);
    }
    return [];
  });
}

function actionUrls(card: Card): Record<string, string> {
  return Object.fromEntries((card.attachments[0].content.actions ?? []).map((action) => [action.title, action.url]));
}

beforeEach(() => {
  posted = [];
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    posted.push(JSON.parse(String(init.body)) as Card);
    return new Response(null, { status: 202 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("manifest", () => {
  it("declares the capabilities the worker uses", () => {
    expect(manifest.capabilities).toEqual(
      expect.arrayContaining(["events.subscribe", "http.outbound", "issues.read", "issue.interactions.read", "approvals.read", "agents.read"]),
    );
    expect(manifest.entrypoints.ui).toBeUndefined();
  });
});

describe("config", () => {
  it("applies defaults and trims the board URL", () => {
    const config = parseConfig({ workflowUrl: " https://x ", boardUrl: "http://localhost:3100/" });
    expect(config.workflowUrl).toBe("https://x");
    expect(config.boardUrl).toBe("http://localhost:3100");
    expect(config.notifyCompleted).toBe(true);
    expect(config.notifyAgentComments).toBe(false);
  });

  it("matches agent bots by id or case-insensitive name and drops malformed entries", () => {
    const config = parseConfig({ agentBots: [{ agent: "Ceo", botAppId }, { agent: "", botAppId: "x" }, "junk"] });
    expect(config.agentBots).toHaveLength(1);
    expect(botAppIdForAgent(config, { id: agentId, name: "CEO" })).toBe(botAppId);
    expect(botAppIdForAgent(config, { id: "other", name: "CFO" })).toBeNull();
  });
});

describe("cards", () => {
  it("builds a Teams Workflows adaptive card message", () => {
    const message = buildTeamsMessage({ kind: "completed", title: "Done thing", agentName: "CEO", openUrl: "http://x" });
    expect(message.type).toBe("message");
    expect(message.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(message.attachments[0].content.version).toBe("1.4");
  });

  it("encodes the bot chat deep link with a draft reply", () => {
    expect(teamsBotChatUrl(botAppId, "Re VIT-42: ")).toBe(
      `https://teams.microsoft.com/l/chat/0/0?users=28%3A${botAppId}&message=Re%20VIT-42%3A%20`,
    );
  });

  it("truncates long bodies", () => {
    expect(truncate("x".repeat(700)).length).toBe(600);
  });
});

describe("events", () => {
  it("does nothing until a workflow URL is configured", async () => {
    const harness = await setup({ workflowUrl: "" });
    await harness.emit("issue.updated", { status: "done", _previous: { status: "in_progress" }, agentId }, {
      companyId,
      entityId: issueId,
      entityType: "issue",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts completed work once per status change with reply and board links", async () => {
    const harness = await setup();
    const update = { status: "done", _previous: { status: "in_progress" }, agentId };
    const base = { companyId, entityId: issueId, entityType: "issue" };
    await harness.emit("issue.updated", update, base);
    await harness.emit("issue.updated", update, base);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(workflowUrl);
    const card = posted[0];
    expect(texts(card)).toEqual(["Work completed", "Draft Q4 supplier plan", "Agent: CEO", "Task: VIT-42"]);
    expect(actionUrls(card)).toEqual({
      "Reply in Teams": teamsBotChatUrl(botAppId, "Re VIT-42: "),
      "Open in Paperclip": "http://localhost:3100/VIT/issues/VIT-42",
    });
  });

  it("ignores updates that did not change status and disabled statuses", async () => {
    const harness = await setup({ notifyBlocked: false });
    const base = { companyId, entityId: issueId, entityType: "issue" };
    await harness.emit("issue.updated", { title: "Renamed" }, base);
    await harness.emit("issue.updated", { status: "done", _previous: { status: "done" } }, base);
    await harness.emit("issue.updated", { status: "blocked", _previous: { status: "in_progress" } }, base);
    await harness.emit("issue.updated", { status: "todo", _previous: { status: "backlog" } }, base);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts pending questions addressed to people", async () => {
    const harness = await setup();
    harness.seed({
      issueInteractions: [
        {
          id: interactionId,
          companyId,
          issueId,
          kind: "ask_user_questions",
          status: "pending",
          title: "Which supplier should we shortlist?",
          summary: "Two quotes came back within budget.",
          createdByAgentId: agentId,
        } as unknown as IssueThreadInteraction,
      ],
    });
    await harness.emit("issue.interaction.created", { interactionId, agentId }, {
      companyId,
      entityId: issueId,
      entityType: "issue",
    });
    expect(texts(posted[0])).toEqual([
      "Your input is needed",
      "Which supplier should we shortlist?",
      "Agent: CEO",
      "Task: VIT-42 · Draft Q4 supplier plan",
      "Two quotes came back within budget.",
    ]);
  });

  it("skips questions addressed only to another agent", async () => {
    const harness = await setup();
    harness.seed({
      issueInteractions: [
        {
          id: interactionId,
          companyId,
          issueId,
          kind: "request_confirmation",
          status: "pending",
          addresseeAgentId: "00000000-0000-4000-8000-000000000009",
        } as unknown as IssueThreadInteraction,
      ],
    });
    await harness.emit("issue.interaction.created", { interactionId }, { companyId, entityId: issueId, entityType: "issue" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts pending approvals with a link to the approval", async () => {
    const harness = await setup();
    harness.seed({
      approvals: [
        {
          id: approvalId,
          companyId,
          type: "hire_agent",
          status: "pending",
          requestedByAgentId: agentId,
          requestedByUserId: null,
          payload: { name: "Marketing Lead" },
        } as unknown as Approval,
      ],
    });
    await harness.emit("approval.created", {}, { companyId, entityId: approvalId, entityType: "approval" });
    expect(texts(posted[0])).toEqual(["Approval requested", "Marketing Lead", "Agent: CEO", "Hire a new agent"]);
    expect(actionUrls(posted[0])["Open in Paperclip"]).toBe(`http://localhost:3100/VIT/approvals/${approvalId}`);
  });

  it("formats budget alerts from cents", async () => {
    const harness = await setup();
    await harness.emit(
      "budget.incident.opened",
      { scopeName: "Vitavera", thresholdType: "soft", amountObserved: 8050, amountLimit: 10000 },
      { companyId },
    );
    expect(texts(posted[0])).toEqual(["Budget alert", "Budget warning threshold crossed", "Vitavera · $80.50 spent of $100.00"]);
  });

  it("only posts run failures and agent comments when enabled", async () => {
    const harness = await setup();
    await harness.emit("agent.run.failed", { agentId, error: "boom" }, { companyId });
    await harness.emit("issue.comment.created", { bodySnippet: "Progress" }, {
      companyId,
      entityId: issueId,
      entityType: "issue",
      actorType: "agent",
      actorId: agentId,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    harness.setConfig({ workflowUrl, notifyRunFailures: true, notifyAgentComments: true });
    await harness.emit("agent.run.failed", { agentId, error: "boom" }, { companyId });
    await harness.emit("issue.comment.created", { bodySnippet: "Progress" }, {
      companyId,
      entityId: issueId,
      entityType: "issue",
      actorType: "agent",
      actorId: agentId,
    });
    expect(posted.map((card) => texts(card)[0])).toEqual(["Agent run failed", "Agent update"]);
  });

  it("keeps working when Teams rejects a post", async () => {
    fetchMock.mockResolvedValueOnce(new Response("throttled", { status: 429 }));
    const harness = await setup();
    await expect(
      harness.emit("issue.updated", { status: "in_review", _previous: { status: "in_progress" } }, {
        companyId,
        entityId: issueId,
        entityType: "issue",
      }),
    ).resolves.toBeUndefined();
    expect(harness.logs.some((entry) => entry.level === "warn" && !JSON.stringify(entry).includes("sig=secret"))).toBe(true);
  });
});
