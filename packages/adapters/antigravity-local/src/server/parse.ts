import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface ParsedAntigravityResult {
  sessionId: string | null;
  summary: string;
  errorMessage: string | null;
}

export function parseAntigravityJsonl(stdout: string): ParsedAntigravityResult {
  return {
    sessionId: null,
    summary: stdout.trim(),
    errorMessage: null,
  };
}

export function isAntigravityUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`;
  return /unknown\s+session|conversation(?:\s+.*)?\s+not\s+found|resume\s+.*\s+not\s+found|invalid\s+session/i.test(haystack);
}

export async function findLatestConversationId(workspacePath: string): Promise<string | null> {
  const historyPath = path.join(os.homedir(), ".gemini", "antigravity-cli", "history.jsonl");
  try {
    const content = await fs.readFile(historyPath, "utf8");
    const lines = content.split(/\r?\n/).reverse();
    const normalizedWorkspace = path.resolve(workspacePath).replace(/\\/g, "/").toLowerCase();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry && typeof entry === "object") {
          const entryWorkspace = typeof entry.workspace === "string" ? path.resolve(entry.workspace).replace(/\\/g, "/").toLowerCase() : "";
          if (entryWorkspace === normalizedWorkspace && typeof entry.conversationId === "string") {
            return entry.conversationId;
          }
        }
      } catch {
        // skip unparsable lines
      }
    }
  } catch (err) {
    // History file might not exist or be unreadable
  }
  return null;
}
