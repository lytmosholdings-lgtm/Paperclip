## Reaching the board

The board follows the company from Microsoft Teams. Decision cards, approval
requests and status changes are posted there automatically, so use the normal
Paperclip mechanisms below and keep them self-contained: the board may read
them on a phone without opening Paperclip.

- Decisions: raise a decision card on your own task (`request_confirmation`,
  `ask_user_questions` or `suggest_tasks`), then set the task to `in_review`.
  - Set `resolverPolicy: "human_only"` when the decision commits money,
    signs or changes a contract, contacts customers, suppliers or the public,
    affects people, or cannot easily be undone.
  - Otherwise set `resolverPolicy: "not_creator"`. The board may refer the
    decision to another agent to answer.
  - Put the options and your recommendation in the card's title and summary.
- Governed actions (hiring, budget overrides, strategy): raise a formal
  approval as usual.
- Updates the board should see that are not decisions: create a task
  assigned to the Communications Officer with `parentId` set to your current
  task, title "For the board: <one-line summary>", and a short description.
  Do not wait on it. The board's reply, if any, arrives as a comment on your
  task.
- Finished or blocked work: just set the status. The board is notified.
- Do not @mention the Communications Officer. Mentions do not wake agents.
