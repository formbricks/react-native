/* eslint-disable no-console -- we need to log global errors */
import { checkSetup } from "@/lib/common/setup";
import { wrapThrowsAsync } from "@/lib/common/utils";
import { okVoid, type Result } from "@/types/error";

type QueueCommandResult = Result<void, unknown> | void;
type QueueCommand = (
  ...args: unknown[]
) => Promise<QueueCommandResult> | QueueCommandResult;

export class CommandQueue {
  private readonly queue: {
    command: QueueCommand;
    checkSetup: boolean;
    commandArgs: unknown[];
  }[] = [];
  private running = false;
  private resolvePromise: (() => void) | null = null;
  private commandPromise: Promise<void> | null = null;

  public add<A extends unknown[]>(
    command: (...args: A) => Promise<QueueCommandResult> | QueueCommandResult,
    shouldCheckSetup = true,
    ...args: A
  ): void {
    this.queue.push({
      command: command as QueueCommand,
      checkSetup: shouldCheckSetup,
      commandArgs: args,
    });

    if (!this.running) {
      this.commandPromise = new Promise((resolve) => {
        this.resolvePromise = resolve;
        void this.run();
      });
    }
  }

  public async wait(): Promise<void> {
    if (this.running) {
      await this.commandPromise;
    }
  }

  private async run(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const currentItem = this.queue.shift();

      if (!currentItem) continue;

      // make sure formbricks is setup
      if (currentItem.checkSetup) {
        // call different function based on package type
        const setupResult = checkSetup();

        if (!setupResult.ok) {
          continue;
        }
      }

      const executeCommand = async (): Promise<Result<void, unknown>> =>
        normalizeQueueCommandResult(
          await currentItem.command.apply(null, currentItem.commandArgs),
        );

      const result = await wrapThrowsAsync(executeCommand)();

      if (!result.ok) {
        console.error("🧱 Formbricks - Global error: ", result.error);
      } else if (!result.data.ok) {
        console.error("🧱 Formbricks - Global error: ", result.data.error);
      }
    }
    this.running = false;
    if (this.resolvePromise) {
      this.resolvePromise();
      this.resolvePromise = null;
      this.commandPromise = null;
    }
  }
}

const normalizeQueueCommandResult = (
  value: QueueCommandResult,
): Result<void, unknown> => {
  if (!value) {
    return okVoid();
  }

  if ("ok" in value && typeof value.ok === "boolean") {
    return value;
  }

  return okVoid();
};
