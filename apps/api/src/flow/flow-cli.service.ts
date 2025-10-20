import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { resolve, sep } from "path";

const deriveProjectRoot = (): string => {
  const cwd = process.cwd();
  const suffix = `${sep}apps${sep}api`;
  if (cwd.endsWith(suffix)) {
    return resolve(cwd, "..", "..");
  }
  return cwd;
};

const projectRoot = process.env.PROJECT_ROOT ?? deriveProjectRoot();

interface FlowCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

@Injectable()
export class FlowCliService {
  private readonly logger = new Logger(FlowCliService.name);

  async execute(args: string[]): Promise<FlowCommandResult> {
    return new Promise<FlowCommandResult>((resolvePromise, rejectPromise) => {
      const child = spawn("flow", args, {
        cwd: projectRoot,
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      if (child.stdout) {
        const reader = createInterface({ input: child.stdout });
        reader.on("line", (line) => {
          stdout += `${line}\n`;
        });
      }

      if (child.stderr) {
        const reader = createInterface({ input: child.stderr });
        reader.on("line", (line) => {
          stderr += `${line}\n`;
        });
      }

      child.on("error", (error) => {
        rejectPromise(error);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          this.logger.error(`flow ${args.join(" ")} failed: ${stderr.trim()}`);
        }
        resolvePromise({
          stdout,
          stderr,
          exitCode: code,
        });
      });
    });
  }

  async executeJson<T>(args: string[]): Promise<T> {
    const result = await this.execute([...args, "--output", "json"]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || "flow command failed");
    }

    const payload = result.stdout.trim();
    const jsonStart = payload.indexOf("{");
    if (jsonStart < 0) {
      throw new Error("flow command did not return JSON payload");
    }

    const jsonString = payload.slice(jsonStart);
    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      throw new Error(`failed to parse flow JSON output: ${(error as Error).message}`);
    }
  }
}
