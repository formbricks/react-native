import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  addCleanupEventListeners,
  addEventListeners,
  removeAllEventListeners,
  removeCleanupEventListeners,
} from "@/lib/common/event-listeners";
import {
  addEnvironmentStateExpiryCheckListener,
  clearEnvironmentStateExpiryCheckListener,
} from "@/lib/environment/state";
import {
  addUserStateExpiryCheckListener,
  clearUserStateExpiryCheckListener,
} from "@/lib/user/state";

vi.mock("@/lib/environment/state", () => ({
  addEnvironmentStateExpiryCheckListener: vi.fn(),
  clearEnvironmentStateExpiryCheckListener: vi.fn(),
}));

vi.mock("@/lib/user/state", () => ({
  addUserStateExpiryCheckListener: vi.fn(),
  clearUserStateExpiryCheckListener: vi.fn(),
}));

describe("event-listeners.ts", () => {
  beforeEach(() => {
    removeCleanupEventListeners();
    vi.clearAllMocks();
  });

  test("adds environment and user expiry listeners", () => {
    addEventListeners();

    expect(addEnvironmentStateExpiryCheckListener).toHaveBeenCalledTimes(1);
    expect(addUserStateExpiryCheckListener).toHaveBeenCalledTimes(1);
  });

  test("adds cleanup listeners only once until removed", () => {
    addCleanupEventListeners();
    addCleanupEventListeners();

    expect(clearEnvironmentStateExpiryCheckListener).toHaveBeenCalledTimes(1);
    expect(clearUserStateExpiryCheckListener).toHaveBeenCalledTimes(1);
  });

  test("does nothing when cleanup listeners were not added", () => {
    removeCleanupEventListeners();

    expect(clearEnvironmentStateExpiryCheckListener).not.toHaveBeenCalled();
    expect(clearUserStateExpiryCheckListener).not.toHaveBeenCalled();
  });

  test("removes cleanup listeners and allows re-adding them", () => {
    addCleanupEventListeners();
    removeCleanupEventListeners();
    addCleanupEventListeners();

    expect(clearEnvironmentStateExpiryCheckListener).toHaveBeenCalledTimes(3);
    expect(clearUserStateExpiryCheckListener).toHaveBeenCalledTimes(3);
  });

  test("removes all listeners", () => {
    addCleanupEventListeners();
    vi.clearAllMocks();

    removeAllEventListeners();

    expect(clearEnvironmentStateExpiryCheckListener).toHaveBeenCalledTimes(2);
    expect(clearUserStateExpiryCheckListener).toHaveBeenCalledTimes(2);
  });
});
