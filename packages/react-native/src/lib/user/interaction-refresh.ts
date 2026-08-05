import { Logger } from "@/lib/common/logger";
import { UpdateQueue } from "@/lib/user/update-queue";
import type { TSurvey } from "@/types/survey";

const logger = Logger.getInstance();

export type TInteractionSource = keyof NonNullable<
  TSurvey["interactionRefresh"]
>;

/**
 * Refresh server-computed segment membership after a survey interaction (display / response /
 * finish).
 *
 * A `surveyInteraction` segment filter can change who a contact is the moment they interact with
 * a survey (e.g. "have seen X", "have completed X"), so we pull fresh `segments` instead of
 * waiting for the user-state TTL. But that refresh is a heavy `/user` recompute, so it is:
 *   - Gated per survey and per event via `survey.interactionRefresh`: only interactions that can
 *     actually change some live survey's membership trigger a refetch. A survey referenced only
 *     by a "have seen" filter refreshes on display but not on response/finish, and a survey no
 *     interaction filter references never refreshes.
 *   - Routed through the UpdateQueue rather than a raw `sendUpdates`, so the display -> response
 *     -> finish burst coalesces into a single debounced call.
 *
 * No-op for anonymous users (no `userId`) and when the interaction can't change membership.
 */
export const refreshSegmentsAfterInteraction = (
  userId: string | null,
  survey: TSurvey,
  source: TInteractionSource,
): void => {
  if (!userId) return;

  const shouldRefresh = survey.interactionRefresh?.[source] ?? false;
  if (!shouldRefresh) return;

  logger.debug(`Refreshing segments after ${source} on survey ${survey.id}`);

  const updateQueue = UpdateQueue.getInstance();
  updateQueue.updateUserId(userId);
  void updateQueue.processUpdates();
};
