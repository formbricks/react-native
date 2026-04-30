import {
  addUserStateExpiryCheckListener,
  clearUserStateExpiryCheckListener,
} from "@/lib/user/state";
import {
  addWorkspaceStateExpiryCheckListener,
  clearWorkspaceStateExpiryCheckListener,
} from "@/lib/workspace/state";

let areRemoveEventListenersAdded = false;

export const addEventListeners = (): void => {
  void addWorkspaceStateExpiryCheckListener();
  void addUserStateExpiryCheckListener();
};

export const addCleanupEventListeners = (): void => {
  if (areRemoveEventListenersAdded) return;
  clearWorkspaceStateExpiryCheckListener();
  clearUserStateExpiryCheckListener();
  areRemoveEventListenersAdded = true;
};

export const removeCleanupEventListeners = (): void => {
  if (!areRemoveEventListenersAdded) return;
  clearWorkspaceStateExpiryCheckListener();
  clearUserStateExpiryCheckListener();
  areRemoveEventListenersAdded = false;
};

export const removeAllEventListeners = (): void => {
  clearWorkspaceStateExpiryCheckListener();
  clearUserStateExpiryCheckListener();
  removeCleanupEventListeners();
};
