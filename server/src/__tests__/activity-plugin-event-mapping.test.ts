import { describe, expect, it } from "vitest";
import { eventTypeForActivityAction } from "../services/activity-log.js";

describe("eventTypeForActivityAction", () => {
  it("passes through actions that are already plugin event types", () => {
    expect(eventTypeForActivityAction("issue.updated")).toBe("issue.updated");
    expect(eventTypeForActivityAction("approval.created")).toBe("approval.created");
  });

  it("maps issue-thread interaction creation to issue.interaction.created", () => {
    expect(eventTypeForActivityAction("issue.thread_interaction_created")).toBe("issue.interaction.created");
  });

  it("does not forward other interaction lifecycle actions", () => {
    expect(eventTypeForActivityAction("issue.thread_interaction_answered")).toBeNull();
    expect(eventTypeForActivityAction("issue.thread_interaction_resolved")).toBeNull();
  });
});
