import { beforeEach, describe, expect, test, vi } from "vitest";
import { CommandQueue } from "@/lib/common/command-queue";
import { checkSetup } from "@/lib/common/setup";
import { type Result } from "@/types/error";
import { delayedResult } from "../utils";

// Mock the setup module so we can control checkSetup()
vi.mock("@/lib/common/setup", () => ({
  checkSetup: vi.fn(),
}));

describe("CommandQueue", () => {
  let queue: CommandQueue;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Create a fresh CommandQueue instance
    queue = new CommandQueue();
  });

  test("executes commands in FIFO order", async () => {
    const executionOrder: string[] = [];

    // Mock commands with proper Result returns
    const cmdA = vi.fn(async (): Promise<Result<void, unknown>> => {
      executionOrder.push("A");
      return delayedResult({ ok: true, data: undefined }, 10);
    });
    const cmdB = vi.fn(async (): Promise<Result<void, unknown>> => {
      executionOrder.push("B");
      return delayedResult({ ok: true, data: undefined }, 10);
    });
    const cmdC = vi.fn(async (): Promise<Result<void, unknown>> => {
      executionOrder.push("C");
      return delayedResult({ ok: true, data: undefined }, 10);
    });

    // We'll assume checkSetup always ok for this test
    vi.mocked(checkSetup).mockReturnValue({ ok: true, data: undefined });

    // Enqueue commands
    queue.add(cmdA, true);
    queue.add(cmdB, true);
    queue.add(cmdC, true);

    // Wait for them to finish
    await queue.wait();

    expect(executionOrder).toEqual(["A", "B", "C"]);
  });

  test("skips execution if checkSetup() fails", async () => {
    const cmd = vi.fn(async (): Promise<void> => {
      return delayedResult(undefined, 10);
    });

    // Force checkSetup to fail
    vi.mocked(checkSetup).mockReturnValue({
      ok: false,
      error: {
        code: "not_setup",
        message: "Not setup",
      },
    });

    queue.add(cmd, true);
    await queue.wait();

    // Command should never have been called
    expect(cmd).not.toHaveBeenCalled();
  });

  test("executes command if checkSetup is false (no check)", async () => {
    const cmd = vi.fn(async (): Promise<Result<void, unknown>> => {
      return delayedResult({ ok: true, data: undefined }, 10);
    });

    // checkSetup is irrelevant in this scenario, but let's mock it anyway
    vi.mocked(checkSetup).mockReturnValue({ ok: true, data: undefined });

    // Here we pass 'false' for the second argument, so no check is performed
    queue.add(cmd, false);
    await queue.wait();

    expect(cmd).toHaveBeenCalledTimes(1);
  });

  test("logs errors if a command throws or returns error", async () => {
    // Spy on console.error to see if it's called
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {
        return {
          ok: true,
          data: undefined,
        };
      });

    // Force checkSetup to succeed
    vi.mocked(checkSetup).mockReturnValue({ ok: true, data: undefined });

    // Mock command that fails
    const failingCmd = vi.fn(async () => {
      await delayedResult("some error", 10);

      throw new Error("some error");
    });

    queue.add(failingCmd, true);
    await queue.wait();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "🧱 Formbricks - Global error: ",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  test("resolves wait() after all commands complete", async () => {
    const cmd1 = vi.fn(async (): Promise<Result<void, unknown>> => {
      return delayedResult({ ok: true, data: undefined }, 10);
    });
    const cmd2 = vi.fn(async (): Promise<Result<void, unknown>> => {
      return delayedResult({ ok: true, data: undefined }, 10);
    });

    vi.mocked(checkSetup).mockReturnValue({ ok: true, data: undefined });

    queue.add(cmd1, true);
    queue.add(cmd2, true);

    await queue.wait();

    // By the time `await queue.wait()` resolves, both commands should be done
    expect(cmd1).toHaveBeenCalled();
    expect(cmd2).toHaveBeenCalled();
  });
});
