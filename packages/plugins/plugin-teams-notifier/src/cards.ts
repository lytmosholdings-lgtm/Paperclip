/**
 * Adaptive Card payloads in the shape Teams Workflows' "When a Teams webhook
 * request is received" trigger expects. Version 1.4 renders on every Teams
 * client.
 */

export type NotificationKind =
  | "question"
  | "approval"
  | "completed"
  | "in_review"
  | "blocked"
  | "budget"
  | "run_failed"
  | "comment";

export interface Notification {
  kind: NotificationKind;
  title: string;
  agentName?: string | null;
  taskLabel?: string | null;
  body?: string | null;
  openUrl?: string | null;
  replyUrl?: string | null;
}

const MAX_BODY_CHARS = 600;

const HEADINGS: Record<NotificationKind, string> = {
  question: "Your input is needed",
  approval: "Approval requested",
  completed: "Work completed",
  in_review: "Ready for your review",
  blocked: "Task blocked",
  budget: "Budget alert",
  run_failed: "Agent run failed",
  comment: "Agent update",
};

const URGENT: ReadonlySet<NotificationKind> = new Set(["question", "approval", "blocked", "budget", "run_failed"]);

export function truncate(text: string, max = MAX_BODY_CHARS): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function teamsBotChatUrl(botAppId: string, draft: string): string {
  const users = encodeURIComponent(`28:${botAppId}`);
  return `https://teams.microsoft.com/l/chat/0/0?users=${users}&message=${encodeURIComponent(draft)}`;
}

export function buildTeamsMessage(notification: Notification) {
  const facts = [
    notification.agentName ? { title: "Agent", value: notification.agentName } : null,
    notification.taskLabel ? { title: "Task", value: notification.taskLabel } : null,
  ].filter((fact): fact is { title: string; value: string } => fact !== null);

  const body: Array<Record<string, unknown>> = [
    {
      type: "TextBlock",
      text: HEADINGS[notification.kind],
      weight: "Bolder",
      size: "Small",
      color: URGENT.has(notification.kind) ? "Attention" : "Good",
      spacing: "None",
    },
    {
      type: "TextBlock",
      text: notification.title,
      weight: "Bolder",
      size: "Medium",
      wrap: true,
    },
  ];
  if (facts.length > 0) body.push({ type: "FactSet", facts });
  if (notification.body?.trim()) {
    body.push({ type: "TextBlock", text: truncate(notification.body), wrap: true });
  }

  const actions: Array<Record<string, unknown>> = [];
  if (notification.replyUrl) {
    actions.push({ type: "Action.OpenUrl", title: "Reply in Teams", url: notification.replyUrl });
  }
  if (notification.openUrl) {
    actions.push({ type: "Action.OpenUrl", title: "Open in Paperclip", url: notification.openUrl });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          ...(actions.length > 0 ? { actions } : {}),
        },
      },
    ],
  };
}
