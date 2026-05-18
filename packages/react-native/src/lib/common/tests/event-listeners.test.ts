import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  addCleanupEventListeners,
  addEventListeners,
  removeAllEventListeners,
  removeCleanupEventListeners,
} from "@/lib/common/event-listeners";
import {
  addUserStateExpiryCheckListener,
  clearUserStateExpiryCheckListener,
} from "@/lib/user/state";
import {
  addWorkspaceStateExpiryCheckListener,
  clearWorkspaceStateExpiryCheckListener,
} from "@/lib/workspace/state";

vi.mock("@/lib/workspace/state", () => ({
  addWorkspaceStateExpiryCheckListener: vi.fn(),
  clearWorkspaceStateExpiryCheckListener: vi.fn(),
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

  test("adds workspace and user expiry listeners", () => {
    addEventListeners();

    expect(addWorkspaceStateExpiryCheckListener).toHaveBeenCalledTimes(1);
    expect(addUserStateExpiryCheckListener).toHaveBeenCalledTimes(1);
  });

  test("adds cleanup listeners only once until removed", () => {
    addCleanupEventListeners();
    addCleanupEventListeners();

    expect(clearWorkspaceStateExpiryCheckListener).toHaveBeenCalledTimes(1);
    expect(clearUserStateExpiryCheckListener).toHaveBeenCalledTimes(1);
  });

  test("does nothing when cleanup listeners were not added", () => {
    removeCleanupEventListeners();

    expect(clearWorkspaceStateExpiryCheckListener).not.toHaveBeenCalled();
    expect(clearUserStateExpiryCheckListener).not.toHaveBeenCalled();
  });

  test("removes cleanup listeners and allows re-adding them", () => {
    addCleanupEventListeners();
    removeCleanupEventListeners();
    addCleanupEventListeners();

    expect(clearWorkspaceStateExpiryCheckListener).toHaveBeenCalledTimes(3);
    expect(clearUserStateExpiryCheckListener).toHaveBeenCalledTimes(3);
  });

  test("removes all listeners", () => {
    addCleanupEventListeners();
    vi.clearAllMocks();

    removeAllEventListeners();

    expect(clearWorkspaceStateExpiryCheckListener).toHaveBeenCalledTimes(2);
    expect(clearUserStateExpiryCheckListener).toHaveBeenCalledTimes(2);
  });
});
