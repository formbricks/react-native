import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { RNConfig } from "@/lib/common/config";
import {
  addUserStateExpiryCheckListener,
  clearUserStateExpiryCheckListener,
} from "@/lib/user/state";

const mockUserId = "user_123";

vi.mock("@/lib/common/config", () => ({
  RNConfig: {
    getInstance: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
  },
}));

describe("User State Expiry Check Listener", () => {
  let mockRNConfig: MockInstance<() => Promise<RNConfig>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); // Simulate timers

    mockRNConfig = vi.spyOn(RNConfig, "getInstance");
  });

  afterEach(() => {
    clearUserStateExpiryCheckListener(); // Ensure cleanup after each test
  });

  test("should set an interval if not already set and update user state expiry when userId exists", async () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue({
        user: { data: { userId: mockUserId } },
      }),
      update: vi.fn(),
    };

    mockRNConfig.mockReturnValue(mockConfig as unknown as Promise<RNConfig>);

    await addUserStateExpiryCheckListener();

    // Fast-forward time by 1 minute (60,000 ms)
    vi.advanceTimersByTime(60_000);

    // Ensure config.update was called with extended expiry time
    expect(mockConfig.update).toHaveBeenCalledWith({
      user: {
        data: { userId: mockUserId },
        expiresAt: expect.any(Date) as Date,
      },
    });
  });

  test("should not update user state expiry if userId does not exist", () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue({
        user: { data: { userId: null } },
      }),
      update: vi.fn(),
    };

    mockRNConfig.mockReturnValue(mockConfig as unknown as Promise<RNConfig>);

    addUserStateExpiryCheckListener();
    vi.advanceTimersByTime(60_000); // Fast-forward 1 minute

    expect(mockConfig.update).not.toHaveBeenCalled(); // Ensures no update when no userId
  });

  test("should not set multiple intervals if already set", async () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue({
        user: { data: { userId: mockUserId } },
      }),
      update: vi.fn(),
    };

    mockRNConfig.mockReturnValue(mockConfig as unknown as Promise<RNConfig>);

    await addUserStateExpiryCheckListener();
    await addUserStateExpiryCheckListener(); // Call again to check if it prevents multiple intervals

    vi.advanceTimersByTime(60_000); // Fast-forward 1 minute

    expect(mockConfig.update).toHaveBeenCalledTimes(1);
  });

  test("should clear interval when clearUserStateExpiryCheckListener is called", () => {
    const mockConfig = {
      get: vi.fn(),
      update: vi.fn(),
    };

    mockRNConfig.mockReturnValue(mockConfig as unknown as Promise<RNConfig>);

    addUserStateExpiryCheckListener();
    clearUserStateExpiryCheckListener();

    vi.advanceTimersByTime(60_000); // Fast-forward 1 minute

    expect(mockConfig.update).not.toHaveBeenCalled();
  });
});
