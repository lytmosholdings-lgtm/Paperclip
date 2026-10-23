# Microsoft Teams Notifier

Posts Paperclip events to a Microsoft Teams chat or channel as Adaptive Cards,
through a Teams Workflows webhook. Outbound only: Paperclip needs no public URL
for this plugin.

| Event | Card | Default |
|-------|------|---------|
| Another agent assigns a task to the communications officer | Message for you | on |
| An agent asks a person a question or needs a decision | Your input is needed | on |
| An approval is requested | Approval requested | on |
| A task moves to `done` | Work completed | on |
| A task moves to `in_review` | Ready for your review | on |
| A task moves to `blocked` | Task blocked | on |
| A budget threshold is crossed | Budget alert | on |
| An agent run fails | Agent run failed | off |
| Any agent comment | Agent update | off |

Each card has an **Open in Paperclip** button. When an agent is also connected
to Teams through the chat connector, map it under **Agent Teams bots** and the
card gets a **Reply in Teams** button that opens a chat with that agent's bot,
pre-filled with `Re <task>: `. Your reply reaches the agent through the chat
connector; it lands in your direct-message conversation with that agent rather
than on the original task, so keep the task reference in the message.

Question and approval cards show **Who decides**: "Board only", or whether an
agent may answer. Approvals and board-only questions are resolved on the
Paperclip board.

### Communications officer mode

Set **Communications officer agent** to route everything through one agent:

- Tasks other agents assign to the officer are posted once as "Message for
  you", with the task description.
- Every **Reply in Teams** button opens a chat with the officer's bot.
- The officer's own tasks (its Teams conversations and relayed messages) are
  not notified again.

Instruction templates live in `templates/`. See
`docs/guides/board-operator/communications-officer.md` for the full setup.

## Setup

1. In Teams, open the chat or channel that should receive notifications, open
   **Workflows**, and create a workflow from the **Send webhook alerts to a
   chat** (or **to a channel**) template. Copy the HTTP POST URL it shows.
   Treat it like a password.
2. Build and install the plugin from a Paperclip source checkout:

   ```sh
   pnpm --filter @paperclipai/plugin-teams-notifier build
   pnpm paperclipai plugin install "$PWD/packages/plugins/plugin-teams-notifier"
   ```

3. In Paperclip, open the plugin's settings, paste the workflow URL, set the
   board URL (default `http://localhost:3100`), and choose which events to send.

Question notifications rely on the `issue.interaction.created` plugin event.

## Development

```sh
pnpm --filter @paperclipai/plugin-teams-notifier typecheck
pnpm --filter @paperclipai/plugin-teams-notifier test
```
