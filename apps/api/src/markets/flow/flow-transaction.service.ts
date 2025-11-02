import { Injectable, Logger } from "@nestjs/common";

import { FlowCliService } from "../../flow/flow-cli.service";

export interface FlowTransactionOptions {
  transactionPath: string;
  arguments: Array<{ type: string; value: unknown }>;
  signer: string;
  network?: string;
  waitForSeal?: boolean;
}

export interface FlowTransactionResult {
  transactionId: string;
  rawStdout: string;
  rawStderr: string;
}

@Injectable()
export class FlowTransactionService {
  private readonly logger = new Logger(FlowTransactionService.name);

  constructor(private readonly flowCli: FlowCliService) {}

  async send(options: FlowTransactionOptions): Promise<FlowTransactionResult> {
    const cliArgs = this.buildArgs(options);
    const { stdout, stderr, exitCode } = await this.flowCli.execute(cliArgs);

    if (exitCode !== 0) {
      this.logger.error(`flow ${cliArgs.join(" ")} failed: ${stderr.trim()}`);
      throw new Error(stderr.trim() || "flow transaction failed");
    }

    const transactionId = this.extractTransactionId(stdout);
    if (!transactionId) {
      throw new Error("Unable to parse transaction id from flow output");
    }

    return {
      transactionId,
      rawStdout: stdout,
      rawStderr: stderr,
    };
  }

  private buildArgs(options: FlowTransactionOptions): string[] {
    const args = [
      "transactions",
      "send",
      options.transactionPath,
      "--args-json",
      JSON.stringify(options.arguments),
      "--signer",
      options.signer,
      "--yes",
    ];

    if (options.network) {
      args.push("--network", options.network);
    }

    if (options.waitForSeal ?? true) {
      args.push("--wait");
    }

    return args;
  }

  private extractTransactionId(output: string): string | null {
    const match = output.match(/Transaction ID:\s*([0-9a-fA-F]+)/);
    return match ? match[1] : null;
  }

  async executeTransaction(options: FlowTransactionOptions): Promise<FlowTransactionResult> {
    return this.send(options);
  }

  async executeScript(options: { scriptPath: string; arguments: Array<{ type: string; value: unknown }>; network?: string }): Promise<any> {
    const cliArgs = [
      "scripts",
      "execute",
      options.scriptPath,
      "--args-json",
      JSON.stringify(options.arguments),
    ];

    if (options.network) {
      cliArgs.push("--network", options.network);
    }

    const { stdout, stderr, exitCode } = await this.flowCli.execute(cliArgs);

    if (exitCode !== 0) {
      this.logger.error(`flow ${cliArgs.join(" ")} failed: ${stderr.trim()}`);
      throw new Error(stderr.trim() || "flow script failed");
    }

    return {
      result: stdout,
      rawStdout: stdout,
      rawStderr: stderr,
    };
  }
}
