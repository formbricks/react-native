import { beforeEach, describe, expect, test, vi } from "vitest";
import { refreshSegmentsAfterInteraction } from "@/lib/user/interaction-refresh";
import { UpdateQueue } from "@/lib/user/update-queue";
import type { TSurvey } from "@/types/survey";

const updateUserId = vi.fn();
const processUpdates = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/user/update-queue", () => ({
  UpdateQueue: {
    getInstance: vi.fn(() => ({
      updateUserId,
      processUpdates,
    })),
  },
}));

const survey = (interactionRefresh?: TSurvey["interactionRefresh"]): TSurvey =>
  ({
    id: "survey-a",
    interactionRefresh,
  }) as unknown as TSurvey;

describe("refreshSegmentsAfterInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The shared vitest setup calls `resetAllMocks`, which strips implementations — so the
    // resolved value has to be re-established or `processUpdates()` returns undefined.
    processUpdates.mockResolvedValue(undefined);
  });

  test("no-ops for an anonymous user even when the gate is open", () => {
    refreshSegmentsAfterInteraction(
      null,
      survey({ onDisplay: true, onResponse: true, onFinished: true }),
      "onDisplay",
    );

    expect(UpdateQueue.getInstance).not.toHaveBeenCalled();
    expect(updateUserId).not.toHaveBeenCalled();
    expect(processUpdates).not.toHaveBeenCalled();
  });

  test("no-ops when interactionRefresh is absent — the workspace has no interaction targeting", () => {
    refreshSegmentsAfterInteraction("user-1", survey(undefined), "onDisplay");

    expect(updateUserId).not.toHaveBeenCalled();
    expect(processUpdates).not.toHaveBeenCalled();
  });

  test("no-ops when every flag is false — no interaction filter references this survey", () => {
    refreshSegmentsAfterInteraction(
      "user-1",
      survey({ onDisplay: false, onResponse: false, onFinished: false }),
      "onDisplay",
    );

    expect(updateUserId).not.toHaveBeenCalled();
    expect(processUpdates).not.toHaveBeenCalled();
  });

  test("no-ops when the flag for a different source is set", () => {
    refreshSegmentsAfterInteraction(
      "user-1",
      survey({ onDisplay: true, onResponse: false, onFinished: false }),
      "onResponse",
    );

    expect(updateUserId).not.toHaveBeenCalled();
    expect(processUpdates).not.toHaveBeenCalled();
  });

  test.each([
    [
      "onDisplay" as const,
      { onDisplay: true, onResponse: false, onFinished: false },
    ],
    [
      "onResponse" as const,
      { onDisplay: false, onResponse: true, onFinished: false },
    ],
    [
      "onFinished" as const,
      { onDisplay: false, onResponse: false, onFinished: true },
    ],
  ])("refreshes for %s when its flag is set", (source, flags) => {
    refreshSegmentsAfterInteraction("user-1", survey(flags), source);

    expect(updateUserId).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(processUpdates).toHaveBeenCalledOnce();
  });

  test("a partial gate object treats missing flags as false", () => {
    const partial = { onDisplay: true } as NonNullable<
      TSurvey["interactionRefresh"]
    >;

    refreshSegmentsAfterInteraction("user-1", survey(partial), "onFinished");
    expect(processUpdates).not.toHaveBeenCalled();

    refreshSegmentsAfterInteraction("user-1", survey(partial), "onDisplay");
    expect(processUpdates).toHaveBeenCalledOnce();
  });

  /**
   * The flush is fire-and-forget, so a bare `void` would leave a rejection unhandled. Asserting
   * that `.catch` is called is white-box, but Node only reports an unhandled rejection on a
   * later tick, so watching `process.on("unhandledRejection")` here passes either way — it does
   * not actually pin the behaviour.
   */
  test("attaches a rejection handler to the fire-and-forget flush", () => {
    const catchSpy = vi.fn().mockReturnValue(undefined);
    processUpdates.mockReturnValueOnce({
      catch: catchSpy,
    } as unknown as Promise<void>);

    refreshSegmentsAfterInteraction(
      "user-1",
      survey({ onDisplay: true, onResponse: false, onFinished: false }),
      "onDisplay",
    );

    expect(catchSpy).toHaveBeenCalledOnce();
  });

  test("a rejected flush never surfaces to the caller", async () => {
    processUpdates.mockRejectedValueOnce(new Error("flush blew up"));

    expect(() => {
      refreshSegmentsAfterInteraction(
        "user-1",
        survey({ onDisplay: true, onResponse: false, onFinished: false }),
        "onDisplay",
      );
    }).not.toThrow();

    await Promise.resolve();
    expect(processUpdates).toHaveBeenCalledOnce();
  });

  test("routes through the queue rather than sending directly, so a burst coalesces", () => {
    const allOn = survey({
      onDisplay: true,
      onResponse: true,
      onFinished: true,
    });

    refreshSegmentsAfterInteraction("user-1", allOn, "onDisplay");
    refreshSegmentsAfterInteraction("user-1", allOn, "onResponse");
    refreshSegmentsAfterInteraction("user-1", allOn, "onFinished");

    // Three nudges, three queue pokes — the queue's own debounce is what collapses them into
    // one request, which is covered by update-queue.test.ts.
    expect(updateUserId).toHaveBeenCalledTimes(3);
    expect(processUpdates).toHaveBeenCalledTimes(3);
    expect(updateUserId).toHaveBeenLastCalledWith("user-1");
  });
});
