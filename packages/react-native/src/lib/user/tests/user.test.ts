import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest";
import { RNConfig } from "@/lib/common/config";
import { Logger } from "@/lib/common/logger";
import { tearDown } from "@/lib/common/setup";
import { EmbeddedDataStore } from "@/lib/survey/embedded-data";
import { UpdateQueue } from "@/lib/user/update-queue";
import { logout, setUserId } from "@/lib/user/user";

// Mock dependencies
vi.mock("@/lib/common/config", () => ({
  RNConfig: {
    getInstance: vi.fn(() => ({
      get: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/common/logger", () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/user/update-queue", () => ({
  UpdateQueue: {
    getInstance: vi.fn(() => ({
      updateUserId: vi.fn(),
      processUpdates: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/common/setup", () => ({
  tearDown: vi.fn(),
}));

describe("user.ts", () => {
  const mockUserId = "test-user-123";

  let getInstanceConfigMock: MockInstance<() => Promise<RNConfig>>;
  let getInstanceLoggerMock: MockInstance<() => Logger>;
  let getInstanceUpdateQueueMock: MockInstance<() => UpdateQueue>;

  beforeEach(() => {
    vi.clearAllMocks();
    getInstanceConfigMock = vi.spyOn(RNConfig, "getInstance");
    getInstanceLoggerMock = vi.spyOn(Logger, "getInstance");
    getInstanceUpdateQueueMock = vi.spyOn(UpdateQueue, "getInstance");
  });

  describe("setUserId", () => {
    test("returns ok without updating when same userId is already set", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          user: {
            data: {
              userId: mockUserId,
            },
          },
        }),
      };

      const mockLogger = {
        debug: vi.fn(),
        error: vi.fn(),
      };

      const mockUpdateQueue = {
        updateUserId: vi.fn(),
        processUpdates: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );
      getInstanceLoggerMock.mockReturnValue(mockLogger as unknown as Logger);
      getInstanceUpdateQueueMock.mockReturnValue(
        mockUpdateQueue as unknown as UpdateQueue,
      );

      const result = await setUserId(mockUserId);

      expect(result.ok).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "UserId is already set to the same value, skipping",
      );
      expect(mockUpdateQueue.updateUserId).not.toHaveBeenCalled();
      expect(mockUpdateQueue.processUpdates).not.toHaveBeenCalled();
    });

    test("tears down previous state and sets new userId when different userId is set", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          user: {
            data: {
              userId: "existing-user",
            },
          },
        }),
      };

      const mockLogger = {
        debug: vi.fn(),
        error: vi.fn(),
      };

      const mockUpdateQueue = {
        updateUserId: vi.fn(),
        processUpdates: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );
      getInstanceLoggerMock.mockReturnValue(mockLogger as unknown as Logger);
      getInstanceUpdateQueueMock.mockReturnValue(
        mockUpdateQueue as unknown as UpdateQueue,
      );

      const result = await setUserId(mockUserId);

      expect(result.ok).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Different userId is being set, cleaning up previous user state",
      );
      expect(tearDown).toHaveBeenCalled();
      expect(mockUpdateQueue.updateUserId).toHaveBeenCalledWith(mockUserId);
      expect(mockUpdateQueue.processUpdates).toHaveBeenCalled();
    });

    test("successfully sets userId when none exists", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          user: {
            data: {
              userId: null,
            },
          },
        }),
      };

      const mockLogger = {
        debug: vi.fn(),
        error: vi.fn(),
      };

      const mockUpdateQueue = {
        updateUserId: vi.fn(),
        processUpdates: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );
      getInstanceLoggerMock.mockReturnValue(mockLogger as unknown as Logger);
      getInstanceUpdateQueueMock.mockReturnValue(
        mockUpdateQueue as unknown as UpdateQueue,
      );
      const result = await setUserId(mockUserId);

      expect(result.ok).toBe(true);
      expect(tearDown).not.toHaveBeenCalled();
      expect(mockUpdateQueue.updateUserId).toHaveBeenCalledWith(mockUserId);
      expect(mockUpdateQueue.processUpdates).toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    test("successfully logs out and cleans state when userId is set", async () => {
      const mockLogger = {
        debug: vi.fn(),
        error: vi.fn(),
      };

      getInstanceLoggerMock.mockReturnValue(mockLogger as unknown as Logger);

      const result = await logout();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Logging out and cleaning user state",
      );
      expect(tearDown).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    test("successfully logs out and cleans state even when no userId is set", async () => {
      const mockLogger = {
        debug: vi.fn(),
        error: vi.fn(),
      };

      getInstanceLoggerMock.mockReturnValue(mockLogger as unknown as Logger);

      const result = await logout();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Logging out and cleaning user state",
      );
      expect(tearDown).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });

  /**
   * The ambient Embedded Data bag survives a survey, so it has to be cleared where identity
   * changes — otherwise one user's context rides onto the next user's responses on a shared
   * device. Deliberately NOT cleared on first identification: a host legitimately pushes context
   * before it knows who the user is.
   */
  describe("Embedded Data bag on identity change", () => {
    const store = (): EmbeddedDataStore => EmbeddedDataStore.getInstance();

    const mockDeps = (currentUserId: string | null): void => {
      getInstanceConfigMock.mockReturnValue({
        get: vi
          .fn()
          .mockReturnValue({ user: { data: { userId: currentUserId } } }),
      } as unknown as Promise<RNConfig>);
      getInstanceLoggerMock.mockReturnValue({
        debug: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger);
      getInstanceUpdateQueueMock.mockReturnValue({
        updateUserId: vi.fn(),
        processUpdates: vi.fn(),
      } as unknown as UpdateQueue);
    };

    beforeEach(() => {
      store().clearEmbeddedData();
    });

    test("switching to a different userId clears the bag", async () => {
      mockDeps("existing-user");
      store().setEmbeddedData({ plan: "pro" });

      await setUserId(mockUserId);

      expect(store().getSnapshot()).toEqual({});
    });

    test("identifying for the first time keeps the bag", async () => {
      mockDeps(null);
      store().setEmbeddedData({ plan: "pro" });

      await setUserId(mockUserId);

      expect(store().getSnapshot()).toEqual({ plan: "pro" });
    });

    test("setting the same userId again keeps the bag", async () => {
      mockDeps(mockUserId);
      store().setEmbeddedData({ plan: "pro" });

      await setUserId(mockUserId);

      expect(store().getSnapshot()).toEqual({ plan: "pro" });
    });

    test("logout clears the bag", async () => {
      mockDeps(mockUserId);
      store().setEmbeddedData({ plan: "pro" });

      await logout();

      expect(store().getSnapshot()).toEqual({});
    });
  });
});
