export const type = "antigravity_local";
export const label = "Antigravity (local)";

export const DEFAULT_ANTIGRAVITY_LOCAL_MODEL = "auto";

export const models = [
  {
    id: "auto",
    label: "Auto",
  },
  {
    id: "gemini-3.8-flash-high",
    label: "Gemini 3.8 Flash (High)",
  },
  {
    id: "gemini-3.8-flash-medium",
    label: "Gemini 3.8 Flash (Medium)",
  },
  {
    id: "gemini-3.8-flash-low",
    label: "Gemini 3.8 Flash (Low)",
  },
  {
    id: "gemini-3.7-flash-high",
    label: "Gemini 3.7 Flash (High)",
  },
  {
    id: "gemini-3.7-flash-medium",
    label: "Gemini 3.7 Flash (Medium)",
  },
  {
    id: "gemini-3.7-flash-low",
    label: "Gemini 3.7 Flash (Low)",
  },
  {
    id: "gemini-3.6-flash-high",
    label: "Gemini 3.6 Flash (High)",
  },
  {
    id: "gemini-3.6-flash-medium",
    label: "Gemini 3.6 Flash (Medium)",
  },
  {
    id: "gemini-3.6-flash-low",
    label: "Gemini 3.6 Flash (Low)",
  },
  {
    id: "gemini-3.1-pro-high",
    label: "Gemini 3.1 Pro (High)",
  },
  {
    id: "gemini-3.1-pro-low",
    label: "Gemini 3.1 Pro (Low)",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6 (Thinking)",
  },
  {
    id: "claude-opus-4-6-thinking",
    label: "Claude Opus 4.6 (Thinking)",
  },
  {
    id: "gpt-oss-120b-medium",
    label: "GPT-OSS 120B (Medium)",
  },
];

export const agentConfigurationDoc = `# antigravity_local agent configuration

Adapter: antigravity_local

Use when:
- You want Paperclip to run the Antigravity CLI locally on the host machine
- You want Antigravity chat sessions resumed across heartbeats with --conversation
- You want Paperclip skills injected locally without polluting the global environment

Don't use when:
- You need webhook-style external invocation (use http or openclaw_gateway)
- You only need a one-shot script without an AI coding agent loop (use process)
- Antigravity CLI (agy) is not installed on the machine that runs Paperclip

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- promptTemplate (string, optional): run prompt template
- model (string, optional): Antigravity model id. Defaults to auto.
- sandbox (boolean, optional): run in sandbox mode (default: false, passes --sandbox=none)
- command (string, optional): defaults to "agy"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Runs use positional prompt arguments, not stdin.
- Sessions resume with --conversation when stored session cwd matches the current cwd.
- Paperclip auto-injects local skills into \`~/.gemini/skills/\` via symlinks.
- Authentication can use the local Antigravity CLI login.
`;
