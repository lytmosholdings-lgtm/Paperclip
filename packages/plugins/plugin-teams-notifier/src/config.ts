export interface AgentBotMapping {
  agent: string;
  botAppId: string;
}

export interface TeamsNotifierConfig {
  workflowUrl: string;
  boardUrl: string;
  agentBots: AgentBotMapping[];
  notifyQuestions: boolean;
  notifyApprovals: boolean;
  notifyCompleted: boolean;
  notifyInReview: boolean;
  notifyBlocked: boolean;
  notifyBudget: boolean;
  notifyRunFailures: boolean;
  notifyAgentComments: boolean;
}

export const DEFAULT_CONFIG: TeamsNotifierConfig = {
  workflowUrl: "",
  boardUrl: "http://localhost:3100",
  agentBots: [],
  notifyQuestions: true,
  notifyApprovals: true,
  notifyCompleted: true,
  notifyInReview: true,
  notifyBlocked: true,
  notifyBudget: true,
  notifyRunFailures: false,
  notifyAgentComments: false,
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readAgentBots(value: unknown): AgentBotMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { agent, botAppId } = entry as Record<string, unknown>;
    if (typeof agent !== "string" || typeof botAppId !== "string") return [];
    if (!agent.trim() || !botAppId.trim()) return [];
    return [{ agent: agent.trim(), botAppId: botAppId.trim() }];
  });
}

export function parseConfig(raw: Record<string, unknown>): TeamsNotifierConfig {
  return {
    workflowUrl: readString(raw.workflowUrl, DEFAULT_CONFIG.workflowUrl),
    boardUrl: readString(raw.boardUrl, DEFAULT_CONFIG.boardUrl).replace(/\/+$/, ""),
    agentBots: readAgentBots(raw.agentBots),
    notifyQuestions: readBoolean(raw.notifyQuestions, DEFAULT_CONFIG.notifyQuestions),
    notifyApprovals: readBoolean(raw.notifyApprovals, DEFAULT_CONFIG.notifyApprovals),
    notifyCompleted: readBoolean(raw.notifyCompleted, DEFAULT_CONFIG.notifyCompleted),
    notifyInReview: readBoolean(raw.notifyInReview, DEFAULT_CONFIG.notifyInReview),
    notifyBlocked: readBoolean(raw.notifyBlocked, DEFAULT_CONFIG.notifyBlocked),
    notifyBudget: readBoolean(raw.notifyBudget, DEFAULT_CONFIG.notifyBudget),
    notifyRunFailures: readBoolean(raw.notifyRunFailures, DEFAULT_CONFIG.notifyRunFailures),
    notifyAgentComments: readBoolean(raw.notifyAgentComments, DEFAULT_CONFIG.notifyAgentComments),
  };
}

/** Bot app ID for an agent, matched by ID or case-insensitive name. */
export function botAppIdForAgent(
  config: TeamsNotifierConfig,
  agent: { id: string; name: string } | null,
): string | null {
  if (!agent) return null;
  const name = agent.name.toLowerCase();
  const match = config.agentBots.find(
    (entry) => entry.agent === agent.id || entry.agent.toLowerCase() === name,
  );
  return match?.botAppId ?? null;
}
