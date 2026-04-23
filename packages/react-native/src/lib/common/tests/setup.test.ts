import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  type MockInstance,
  test,
  vi,
} from "vitest";
import { RN_ASYNC_STORAGE_KEY, RNConfig } from "@/lib/common/config";
import {
  addCleanupEventListeners,
  addEventListeners,
  removeAllEventListeners,
} from "@/lib/common/event-listeners";
import { Logger } from "@/lib/common/logger";
import {
  checkSetup,
  handleErrorOnFirstSetup,
  setIsSetup,
  setup,
  tearDown,
} from "@/lib/common/setup";
import type * as CommonUtilsModule from "@/lib/common/utils";
import { filterSurveys, isNowExpired } from "@/lib/common/utils";
import { DEFAULT_USER_STATE_NO_USER_ID } from "@/lib/user/state";
import { sendUpdatesToBackend } from "@/lib/user/update";
import { fetchWorkspaceState } from "@/lib/workspace/state";

// 1) Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

// 2) Mock RNConfig
vi.mock("@/lib/common/config", () => ({
  RN_ASYNC_STORAGE_KEY: "formbricks-react-native",
  RNConfig: {
    getInstance: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
      resetConfig: vi.fn(),
    })),
  },
}));

// 3) Mock logger
vi.mock("@/lib/common/logger", () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// 4) Mock event-listeners
vi.mock("@/lib/common/event-listeners", () => ({
  addEventListeners: vi.fn(),
  addCleanupEventListeners: vi.fn(),
  removeAllEventListeners: vi.fn(),
}));

// 5) Mock fetchWorkspaceState
vi.mock("@/lib/workspace/state", () => ({
  fetchWorkspaceState: vi.fn(),
}));

// 6) Mock filterSurveys
vi.mock("@/lib/common/utils", async () => {
  const actual =
    await vi.importActual<typeof CommonUtilsModule>("@/lib/common/utils");
  return {
    ...actual,
    filterSurveys: vi.fn(),
    isNowExpired: vi.fn(),
  };
});

// 7) Mock user/update
vi.mock("@/lib/user/update", () => ({
  sendUpdatesToBackend: vi.fn(),
}));

describe("setup.ts", () => {
  let getInstanceConfigMock: MockInstance<() => Promise<RNConfig>>;
  let getInstanceLoggerMock: MockInstance<() => Logger>;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // By default, set isSetup to false so we can test setup logic from scratch
    setIsSetup(false);

    getInstanceConfigMock = vi.spyOn(RNConfig, "getInstance");
    getInstanceLoggerMock = vi
      .spyOn(Logger, "getInstance")
      .mockReturnValue(mockLogger as unknown as Logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("setup()", () => {
    test("returns ok if already setup", async () => {
      getInstanceLoggerMock.mockReturnValue(mockLogger as unknown as Logger);
      setIsSetup(true);
      const result = await setup({
        environmentId: "env_id",
        appUrl: "https://my.url",
      });
      expect(result.ok).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Already set up, skipping setup.",
      );
    });

    test("fails if no environmentId or workspaceId is provided", async () => {
      const result = await setup({ appUrl: "https://my.url" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("missing_field");
        expect(result.error).toHaveProperty("field", "workspaceId");
      }
    });

    test("fails if empty environmentId is provided without workspaceId", async () => {
      const result = await setup({
        environmentId: "",
        appUrl: "https://my.url",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("missing_field");
      }
    });

    test("fails if no appUrl is provided", async () => {
      const result = await setup({ environmentId: "env_123", appUrl: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("missing_field");
      }
    });

    test("succeeds with workspaceId instead of environmentId", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue(undefined),
        resetConfig: vi.fn(),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );

      (fetchWorkspaceState as unknown as Mock).mockResolvedValueOnce({
        ok: true,
        data: {
          data: { surveys: [] },
          expiresAt: new Date(Date.now() + 60000),
        },
      });

      (filterSurveys as unknown as Mock).mockReturnValueOnce([]);

      const result = await setup({
        workspaceId: "ws_123",
        appUrl: "https://my.url",
      });
      expect(result.ok).toBe(true);
      expect(fetchWorkspaceState).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws_123" }),
      );
      expect(mockConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws_123" }),
      );
    });

    test("prefers workspaceId over environmentId when both provided", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue(undefined),
        resetConfig: vi.fn(),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );

      (fetchWorkspaceState as unknown as Mock).mockResolvedValueOnce({
        ok: true,
        data: {
          data: { surveys: [] },
          expiresAt: new Date(Date.now() + 60000),
        },
      });

      (filterSurveys as unknown as Mock).mockReturnValueOnce([]);

      const result = await setup({
        workspaceId: "ws_123",
        environmentId: "env_456",
        appUrl: "https://my.url",
      });
      expect(result.ok).toBe(true);
      expect(fetchWorkspaceState).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws_123" }),
      );
    });

    test("logs deprecation warning when only environmentId is used", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          workspaceId: "env_123",
          appUrl: "https://my.url",
          workspace: {
            expiresAt: new Date(Date.now() - 5000),
            data: { actionClasses: [] },
          },
          user: { data: {}, expiresAt: null },
          status: { value: "success", expiresAt: null },
        }),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );

      await setup({
        environmentId: "env_123",
        appUrl: "https://my.url",
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "environmentId is deprecated and will be removed in a future version. Please use workspaceId instead.",
      );
    });

    test("skips setup if existing config is in error state and not expired", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          workspaceId: "env_123",
          appUrl: "https://my.url",
          workspace: {},
          user: { data: {}, expiresAt: null },
          status: { value: "error", expiresAt: new Date(Date.now() + 10000) },
        }),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );

      (isNowExpired as unknown as Mock).mockReturnValue(true);

      const result = await setup({
        environmentId: "env_123",
        appUrl: "https://my.url",
      });
      expect(result.ok).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Formbricks was set to an error state.",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Error state is not expired, skipping setup",
      );
    });

    test("proceeds if error state is expired", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          workspaceId: "env_123",
          appUrl: "https://my.url",
          workspace: {},
          user: { data: {}, expiresAt: null },
          status: { value: "error", expiresAt: new Date(Date.now() - 10000) }, // expired
        }),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );

      const result = await setup({
        environmentId: "env_123",
        appUrl: "https://my.url",
      });
      expect(result.ok).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Formbricks was set to an error state.",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Error state is expired. Continue with setup.",
      );
    });

    test("uses existing config if workspaceId/appUrl match, checks for expiration sync", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          workspaceId: "env_123",
          appUrl: "https://my.url",
          workspace: { expiresAt: new Date(Date.now() - 5000) }, // workspace expired
          user: {
            data: { userId: "user_abc" },
            expiresAt: new Date(Date.now() - 5000), // also expired
          },
          status: { value: "success", expiresAt: null },
        }),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );

      (isNowExpired as unknown as Mock).mockReturnValue(true);

      // Mock workspace state fetch success
      (fetchWorkspaceState as unknown as Mock).mockResolvedValueOnce({
        ok: true,
        data: {
          data: { surveys: [] },
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      // Mock sendUpdatesToBackend success
      (sendUpdatesToBackend as unknown as Mock).mockResolvedValueOnce({
        ok: true,
        data: {
          state: {
            expiresAt: new Date(),
            data: { userId: "user_abc", segments: [] },
          },
        },
      });

      (filterSurveys as unknown as Mock).mockReturnValueOnce([
        { name: "S1" },
        { name: "S2" },
      ]);

      const result = await setup({
        environmentId: "env_123",
        appUrl: "https://my.url",
      });
      expect(result.ok).toBe(true);

      // workspace was fetched
      expect(fetchWorkspaceState).toHaveBeenCalled();
      // user state was updated
      expect(sendUpdatesToBackend).toHaveBeenCalled();
      // filterSurveys called
      expect(filterSurveys).toHaveBeenCalled();
      // config updated
      expect(mockConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- required for testing this object
          user: expect.objectContaining({
            data: { userId: "user_abc", segments: [] },
          }),
          filteredSurveys: [{ name: "S1" }, { name: "S2" }],
        }),
      );
    });

    test("returns an error when workspace sync fails", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          workspaceId: "env_123",
          appUrl: "https://my.url",
          workspace: {
            data: { surveys: [] },
            expiresAt: new Date(Date.now() - 5000),
          },
          user: {
            data: {
              userId: "user_abc",
              contactId: null,
              segments: [],
              displays: [],
              responses: [],
              lastDisplayAt: null,
            },
            expiresAt: new Date(Date.now() - 5000),
          },
          filteredSurveys: [],
          status: { value: "success", expiresAt: null },
        }),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );
      (isNowExpired as unknown as Mock).mockReturnValue(true);
      (fetchWorkspaceState as unknown as Mock).mockResolvedValueOnce({
        ok: false,
        error: {
          code: "network_error",
          message: "Backend unavailable",
        },
      });

      const result = await setup({
        environmentId: "env_123",
        appUrl: "https://my.url",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("network_error");
        expect("message" in result.error && result.error.message).toBe(
          "Error fetching workspace state",
        );
      }
      expect(sendUpdatesToBackend).not.toHaveBeenCalled();
    });

    test("returns an error when user sync fails", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          workspaceId: "env_123",
          appUrl: "https://my.url",
          workspace: {
            data: { surveys: [] },
            expiresAt: new Date(Date.now() + 60_000),
          },
          user: {
            data: {
              userId: "user_abc",
              contactId: null,
              segments: [],
              displays: [],
              responses: [],
              lastDisplayAt: null,
            },
            expiresAt: new Date(Date.now() - 5000),
          },
          filteredSurveys: [],
          status: { value: "success", expiresAt: null },
        }),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );
      (isNowExpired as unknown as Mock)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      (sendUpdatesToBackend as unknown as Mock).mockResolvedValueOnce({
        ok: false,
        error: {
          code: "network_error",
          message: "User sync failed",
        },
      });

      const result = await setup({
        environmentId: "env_123",
        appUrl: "https://my.url",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("network_error");
        expect("message" in result.error && result.error.message).toBe(
          "Error updating user state",
        );
      }
    });

    test("resets config if no valid config found, fetches workspace state, sets default user", async () => {
      const mockConfig = {
        get: () => {
          throw new Error("no config found");
        },
        resetConfig: vi.fn(),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValue(
        mockConfig as unknown as Promise<RNConfig>,
      );

      (fetchWorkspaceState as unknown as Mock).mockResolvedValueOnce({
        ok: true,
        data: {
          data: {
            surveys: [{ name: "SurveyA" }],
            expiresAt: new Date(Date.now() + 60000),
          },
        },
      });

      (filterSurveys as unknown as Mock).mockReturnValueOnce([
        { name: "SurveyA" },
      ]);

      const result = await setup({
        environmentId: "envX",
        appUrl: "https://urlX",
      });
      expect(result.ok).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "No existing configuration found.",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "No valid configuration found. Resetting config and creating new one.",
      );
      expect(mockConfig.resetConfig).toHaveBeenCalled();
      expect(fetchWorkspaceState).toHaveBeenCalled();
      expect(mockConfig.update).toHaveBeenCalledWith({
        appUrl: "https://urlX",
        workspaceId: "envX",
        user: DEFAULT_USER_STATE_NO_USER_ID,
        workspace: {
          data: {
            surveys: [{ name: "SurveyA" }],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- required for testing this object
            expiresAt: expect.any(Date),
          },
        },
        filteredSurveys: [{ name: "SurveyA" }],
      });
    });

    test("calls handleErrorOnFirstSetup if workspace fetch fails initially", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue(undefined),
        update: vi.fn(),
        resetConfig: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValueOnce(
        mockConfig as unknown as Promise<RNConfig>,
      );

      (fetchWorkspaceState as unknown as Mock).mockResolvedValueOnce({
        ok: false,
        error: { code: "forbidden", responseMessage: "No access" },
      });

      await expect(
        setup({ environmentId: "envX", appUrl: "https://urlX" }),
      ).rejects.toThrow("Could not set up formbricks");
    });

    test("falls back to an unknown network error when setup throws a non-object", async () => {
      const mockConfig = {
        get: () => {
          throw new Error("no config found");
        },
        update: vi.fn(),
        resetConfig: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValueOnce(
        mockConfig as unknown as Promise<RNConfig>,
      );
      (fetchWorkspaceState as unknown as Mock).mockRejectedValueOnce("boom");

      await expect(
        setup({ environmentId: "envX", appUrl: "https://urlX" }),
      ).rejects.toThrow("Could not set up formbricks");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error during first setup: network_error - Unknown error. Please try again later.",
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        RN_ASYNC_STORAGE_KEY,
        expect.stringContaining('"value":"error"'),
      );
    });

    test("adds event listeners and sets isSetup", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          workspaceId: "env_abc",
          appUrl: "https://test.app",
          workspace: {},
          user: { data: {}, expiresAt: null },
          status: { value: "success", expiresAt: null },
        }),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValueOnce(
        mockConfig as unknown as Promise<RNConfig>,
      );

      const result = await setup({
        environmentId: "env_abc",
        appUrl: "https://test.app",
      });
      expect(result.ok).toBe(true);
      expect(addEventListeners).toHaveBeenCalled();
      expect(addCleanupEventListeners).toHaveBeenCalled();
    });
  });

  describe("checkSetup()", () => {
    test("returns err if not setup", () => {
      const res = checkSetup();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("not_setup");
      }
    });

    test("returns ok if setup", () => {
      setIsSetup(true);
      const res = checkSetup();
      expect(res.ok).toBe(true);
    });
  });

  describe("tearDown()", () => {
    test("resets user state to default and removes event listeners", async () => {
      const mockConfig = {
        get: vi.fn().mockReturnValue({
          user: { data: { userId: "XYZ" } },
          workspace: { data: { surveys: [] } },
        }),
        update: vi.fn(),
      };

      getInstanceConfigMock.mockReturnValueOnce(
        mockConfig as unknown as Promise<RNConfig>,
      );

      await tearDown();

      expect(mockConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          user: DEFAULT_USER_STATE_NO_USER_ID,
        }),
      );
      expect(removeAllEventListeners).toHaveBeenCalled();
    });
  });

  describe("handleErrorOnFirstSetup()", () => {
    test("stores error state in AsyncStorage, throws error", async () => {
      // We import the function directly
      const errorObj = { code: "forbidden", responseMessage: "No access" };

      await expect(async () => {
        await handleErrorOnFirstSetup(errorObj);
      }).rejects.toThrow("Could not set up formbricks");

      // AsyncStorage setItem should be called with the error config
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        RN_ASYNC_STORAGE_KEY,
        expect.stringContaining('"value":"error"'),
      );
    });
  });
});
