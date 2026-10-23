import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG } from "./config.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip.teams-notifier",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Microsoft Teams Notifier",
  description:
    "Posts agent questions, approval requests, finished or blocked work, and budget alerts to a Microsoft Teams chat or channel through a Teams Workflows webhook.",
  author: "Paperclip",
  categories: ["connector", "automation"],
  capabilities: [
    "events.subscribe",
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "companies.read",
    "issues.read",
    "issue.interactions.read",
    "approvals.read",
    "agents.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      workflowUrl: {
        type: "string",
        title: "Teams Workflow URL",
        description:
          "HTTP POST URL from a Teams Workflow such as \"Post to a chat when a webhook request is received\". Treat it like a password: anyone with it can post into that chat.",
        default: DEFAULT_CONFIG.workflowUrl,
      },
      boardUrl: {
        type: "string",
        title: "Paperclip board URL",
        description: "Base URL for \"Open in Paperclip\" links, e.g. http://localhost:3100.",
        default: DEFAULT_CONFIG.boardUrl,
      },
      agentBots: {
        type: "array",
        title: "Agent Teams bots",
        description:
          "Optional. For agents connected to Teams through the chat connector, adds a \"Reply in Teams\" button that opens a chat with that agent's bot.",
        default: DEFAULT_CONFIG.agentBots,
        items: {
          type: "object",
          properties: {
            agent: { type: "string", title: "Agent name or ID" },
            botAppId: { type: "string", title: "Bot Application (client) ID" },
          },
          required: ["agent", "botAppId"],
        },
      },
      notifyQuestions: {
        type: "boolean",
        title: "Questions and decisions from agents",
        default: DEFAULT_CONFIG.notifyQuestions,
      },
      notifyApprovals: {
        type: "boolean",
        title: "Approval requests",
        default: DEFAULT_CONFIG.notifyApprovals,
      },
      notifyCompleted: {
        type: "boolean",
        title: "Tasks completed",
        default: DEFAULT_CONFIG.notifyCompleted,
      },
      notifyInReview: {
        type: "boolean",
        title: "Tasks ready for review",
        default: DEFAULT_CONFIG.notifyInReview,
      },
      notifyBlocked: {
        type: "boolean",
        title: "Tasks blocked",
        default: DEFAULT_CONFIG.notifyBlocked,
      },
      notifyBudget: {
        type: "boolean",
        title: "Budget alerts",
        default: DEFAULT_CONFIG.notifyBudget,
      },
      notifyRunFailures: {
        type: "boolean",
        title: "Failed agent runs",
        default: DEFAULT_CONFIG.notifyRunFailures,
      },
      notifyAgentComments: {
        type: "boolean",
        title: "Every agent comment (noisy)",
        default: DEFAULT_CONFIG.notifyAgentComments,
      },
    },
  },
};

export default manifest;
