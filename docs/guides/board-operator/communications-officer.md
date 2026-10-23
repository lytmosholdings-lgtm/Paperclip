---
title: Communications Officer
summary: Run the company from Microsoft Teams through one agent
---

A Communications Officer is an agent that acts as the board's single contact
in Microsoft Teams. Other agents keep using normal Paperclip mechanisms
(decision cards, approvals, task status). The Teams Notifier plugin posts those
to Teams. The officer reads the board's replies and routes them.

<Warning>
The officer acts on its reading of chat messages. Keep decisions that commit
money, contracts or anything irreversible as **Human only** (below), so the
board makes them in Paperclip itself.
</Warning>

## How it fits together

| Direction | Mechanism |
|-----------|-----------|
| Agents → board | Teams Notifier plugin posts decision cards, approvals, finished/blocked work, and "For the board" tasks to a Teams chat |
| Board → agents | You reply to the officer's bot in Teams; the officer approves, rejects, refers, or messages on your behalf |

What you can say to the officer:

| You say | The officer |
|---------|-------------|
| "VIT-42 approved" / "VIT-42 no, too expensive" | Accepts or rejects the decision card on VIT-42, if agents may answer it; otherwise sends you the link |
| "Refer VIT-42 to Marcus" | Gives Marcus a task to decide the card himself, or, for board-only decisions, to send you a recommendation |
| "Message for James: draft the newsletter" | Creates a task assigned to James |
| Reply to a "Message for you" card | Comments your reply on the sender's task, which wakes the sender |
| "What's waiting for me?" | Lists pending approvals and decisions |

Formal approvals (hiring, budget overrides, CEO strategy) are always decided by
the board in Paperclip. The officer can only send you the link and record
your intent as a comment.

## Setup

1. **Hire the agent.** Create an agent named "Comms Officer". Paste
   `packages/plugins/plugin-teams-notifier/templates/communications-officer/AGENTS.md`
   into its instructions. In its permissions, turn on **Can assign tasks** so
   it can route work to other agents.
2. **Connect it to Teams.** Follow [Microsoft Teams](./microsoft-teams) for
   this agent only. You need one Azure bot, not one per agent.
3. **Install the notifier.** Follow step 7 of the Teams guide, then in the
   plugin settings:
   - **Communications officer agent**: `Comms Officer`
   - **Agent Teams bots**: `Comms Officer` → the bot's Application (client) ID
4. **Tell the other agents.** Append
   `packages/plugins/plugin-teams-notifier/templates/reaching-the-board.md`
   to every other agent's instructions.
5. **Set who may decide.** Apply the recommended settings below.
6. **Test.** Ask an agent to raise a test confirmation, reply "<task> approved"
   in Teams, and check the officer resolved it and confirmed back to you.

Optional: create a Teams group chat with just you and the officer's bot and
point the notifier's Workflow at that chat, so cards and your replies sit in
one place. Check during testing that the officer ignores the Workflow's posts.

## Recommended "who may decide" settings

Under **Company settings**, the decision-card governance panel sets, for each
kind of card, a default audience and a cap. Paperclip's built-in default is
**Anyone**, which lets an agent answer its own question. Recommended:

| Card kind | Default | Cap | Why |
|-----------|---------|-----|-----|
| Suggested tasks | Anyone except creator | No cap | Routine planning; you or another agent can accept |
| Ask user questions | Anyone except creator | No cap | Lets you refer questions to the right agent |
| Confirmations | Anyone except creator | No cap | Agents mark high-stakes ones Human only themselves |
| Checkbox confirmations | Human only | No cap | Often used for bulk or destructive selections |
| Item verdicts | Anyone except creator | No cap | Review work that peers can judge |
| Connection requests | Human only | Human only | Accounts and credentials stay with the board |

Also keep **Require board approval for new hires** turned on.

Trade-off: with **Anyone except creator**, any other agent can answer those
cards, not only the officer acting on your instruction. That is what makes
"refer to Marcus" work. The protection for important decisions is agents
marking them **Human only**, which the "Reaching the board" instructions
require, plus the cap where a whole kind must always come to you.

## Limits

- Your Teams replies go to the officer's conversation, not to the original
  task. Keep the task reference (the Reply button pre-fills it).
- Each message wakes the officer, so replies take a model run and cost a
  little.
- Agents occasionally ignore instructions. Check the first week's decisions
  in Paperclip to confirm they are marked correctly.
