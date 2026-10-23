import path from "node:path";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  ensurePathInEnv,
  parseObject,
} from "@paperclipai/adapter-utils/server-utils";
import {
  ensureAdapterExecutionTargetCommandResolvable,
  ensureAdapterExecutionTargetDirectory,
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget,
  resolveAdapterExecutionTargetCwd,
} from "@paperclipai/adapter-utils/execution-target";
import { DEFAULT_ANTIGRAVITY_LOCAL_MODEL } from "../index.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "agy");
  const target = ctx.executionTarget ?? null;
  const targetIsRemote = target?.kind === "remote";
  const cwd = resolveAdapterExecutionTargetCwd(target, asString(config.cwd, ""), process.cwd());
  const targetLabel = targetIsRemote
    ? ctx.environmentName ?? describeAdapterExecutionTarget(target)
    : null;
  const runId = `antigravity-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (targetLabel) {
    checks.push({
      code: "antigravity_environment_target",
      level: "info",
      message: `Probing inside environment: ${targetLabel}`,
    });
  }

  try {
    await ensureAdapterExecutionTargetDirectory(runId, target, cwd, {
      cwd,
      env: {},
      createIfMissing: true,
    });
    checks.push({
      code: "antigravity_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "antigravity_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const effectiveEnv = { ...process.env, ...env };
  const runtimeEnv = Object.fromEntries(
    Object.entries(ensurePathInEnv(effectiveEnv)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );

  const commandResolvable = await ensureAdapterExecutionTargetCommandResolvable(command, target, cwd, runtimeEnv)
    .then(() => true)
    .catch(() => false);

  if (commandResolvable) {
    checks.push({
      code: "antigravity_command_resolvable",
      level: "info",
      message: `Command "${command}" is resolvable in path`,
    });
  } else {
    checks.push({
      code: "antigravity_command_unresolvable",
      level: "error",
      message: `Command "${command}" was not found in path`,
      hint: `Install the Antigravity CLI (agy) on your system path.`,
    });
  }

  const canProbe = checks.every((check) => check.code !== "antigravity_cwd_invalid" && check.code !== "antigravity_command_unresolvable");

  if (canProbe) {
    try {
      const probeResult = await runAdapterExecutionTargetProcess(
        runId,
        target,
        command,
        ["--print", "Respond with hello."],
        {
          cwd,
          env: runtimeEnv,
          timeoutSec: 15,
          graceSec: 5,
          onLog: async () => {},
        }
      );

      const hasHello = probeResult.stdout.toLowerCase().includes("hello");
      if (probeResult.exitCode === 0 && hasHello) {
        checks.push({
          code: "antigravity_hello_probe_passed",
          level: "info",
          message: "Hello probe passed successfully",
        });
      } else {
        checks.push({
          code: "antigravity_hello_probe_failed",
          level: "error",
          message: `Probe failed with code ${probeResult.exitCode}`,
          detail: probeResult.stderr || probeResult.stdout,
        });
      }
    } catch (err) {
      checks.push({
        code: "antigravity_hello_probe_failed",
        level: "error",
        message: err instanceof Error ? err.message : "Hello probe failed",
      });
    }
  }

  return {
    status: summarizeStatus(checks),
    checks,
    adapterType: "antigravity_local",
    testedAt: new Date().toISOString(),
  };
}
