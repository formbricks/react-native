import { RNConfig } from "@/lib/common/config";
import { Logger } from "@/lib/common/logger";
import { tearDown } from "@/lib/common/setup";
import { EmbeddedDataStore } from "@/lib/survey/embedded-data";
import { UpdateQueue } from "@/lib/user/update-queue";
import { type ApiErrorResponse, okVoid, type Result } from "@/types/error";

export const setUserId = async (
  userId: string,
): Promise<Result<void, ApiErrorResponse>> => {
  const appConfig = await RNConfig.getInstance();
  const logger = Logger.getInstance();
  const updateQueue = UpdateQueue.getInstance();

  const {
    data: { userId: currentUserId },
  } = appConfig.get().user;

  // If the same userId is already set, no-op
  if (currentUserId === userId) {
    logger.debug("UserId is already set to the same value, skipping");
    return okVoid();
  }

  // If a different userId is set, clean up the previous user state first
  if (currentUserId) {
    logger.debug(
      "Different userId is being set, cleaning up previous user state",
    );
    await tearDown();
    // An identity switch: the ambient Embedded Data bag may carry the previous user's context
    // (hashed ids and the like), which must not ride onto the next user's responses. Deliberately
    // not in tearDown() itself — the setup-error teardown is not an identity switch, and app
    // context should survive a setup retry. First-time identification (no currentUserId) keeps the
    // bag too: the host legitimately pushes context before identifying.
    EmbeddedDataStore.getInstance().clearEmbeddedData();
  }

  updateQueue.updateUserId(userId);
  void updateQueue.processUpdates();
  return okVoid();
};

export const logout = async (): Promise<Result<void>> => {
  const logger = Logger.getInstance();

  logger.debug("Logging out and cleaning user state");
  await tearDown();
  // Same identity-switch rule as setUserId above: logout must not let the previous user's ambient
  // context leak onto whoever uses the app next.
  EmbeddedDataStore.getInstance().clearEmbeddedData();
  return okVoid();
};
