import { CommandQueue } from "@/lib/common/command-queue";
import { Logger } from "@/lib/common/logger";
import * as Actions from "@/lib/survey/action";
import {
  EmbeddedDataStore,
  type TEmbeddedDataInput,
} from "@/lib/survey/embedded-data";
import * as Attributes from "@/lib/user/attribute";
import * as User from "@/lib/user/user";

const logger = Logger.getInstance();
logger.debug("Create command queue");
const queue = new CommandQueue();

export const track = async (name: string): Promise<void> => {
  queue.add(Actions.track, true, name);
  await queue.wait();
};

export const setUserId = async (userId: string): Promise<void> => {
  queue.add(User.setUserId, true, userId);
  await queue.wait();
};

export const setAttribute = async (
  key: string,
  value: string | number | Date,
): Promise<void> => {
  queue.add(Attributes.setAttributes, true, { [key]: value });
  await queue.wait();
};

export const setAttributes = async (
  attributes: Record<string, string | number | Date>,
): Promise<void> => {
  queue.add(Attributes.setAttributes, true, attributes);
  await queue.wait();
};

export const setLanguage = async (language: string): Promise<void> => {
  queue.add(Attributes.setAttributes, true, { language });
  await queue.wait();
};

export const logout = async (): Promise<void> => {
  queue.add(User.logout, true);
  await queue.wait();
};

/**
 * Attach Embedded Data to future responses without tying it to a trigger (ENG-1844). Merges into the
 * in-memory bag, last write wins per key; `{ key: null }` removes a key and `undefined` values are
 * skipped. Values land only on the survey's declared *ingested* fields — anything else is dropped
 * and logged by the renderer, never fatal.
 *
 * Synchronous and network-free on purpose, unlike the queued methods above: calling it on every
 * screen change is free, and routing it through the command queue would silently drop calls made
 * before `setup()` completes — a host legitimately pushes context before the SDK is ready.
 *
 * ```ts
 * setEmbeddedData({ screen: "checkout", plan: "pro" });
 * setEmbeddedData({ screen: null }); // remove one key
 * ```
 */
export const setEmbeddedData = (data: TEmbeddedDataInput): void => {
  EmbeddedDataStore.getInstance().setEmbeddedData(data);
};

/**
 * Remove one Embedded Data key, or clear the whole bag when called with no argument — logout, or a
 * hard context switch. Synchronous, no network. A key that evaluated to `undefined` is a no-op, not
 * a full clear: the arity is forwarded, so only a literal zero-argument call wipes everything.
 */
export const clearEmbeddedData = (...args: [] | [key: string]): void => {
  EmbeddedDataStore.getInstance().clearEmbeddedData(...args);
};

export { Formbricks, Formbricks as default } from "@/components/formbricks";
