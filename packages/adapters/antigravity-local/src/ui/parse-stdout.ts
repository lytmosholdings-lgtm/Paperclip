import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseAntigravityStdoutLine(line: string, ts: string): TranscriptEntry[] {
  // Since antigravity outputs plain text by default, return it as stdout
  return [{ kind: "stdout", ts, text: line }];
}
