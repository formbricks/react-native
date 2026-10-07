import { Appearance as NativeAppearance } from "react-native";
import { Logger } from "@/lib/common/logger";

/** What a host app may ask for. `"system"` follows the app's own theme, never sent to the WebView. */
export type TAppearance = "light" | "dark" | "system";
/** What the renderer receives: always a concrete value. */
export type TResolvedAppearance = "light" | "dark";

const APPEARANCES: ReadonlySet<unknown> = new Set<TAppearance>([
  "light",
  "dark",
  "system",
]);

// In memory for the process only (ENG-3452): appearance is an app setting, not a contact attribute,
// so it is neither persisted nor sent to the server. Logout leaves it alone; a cold start is light
// (ENG-3551).
let appearance: TAppearance = "light";
const listeners = new Set<() => void>();

export const isAppearance = (value: unknown): value is TAppearance =>
  APPEARANCES.has(value);

export const getAppearance = (): TAppearance => appearance;

/**
 * Resolves the requested appearance to what the renderer understands. `"system"` is the app's own
 * theme (`Appearance.getColorScheme()`, which honours `Appearance.setColorScheme` overrides), not
 * the phone's — WebViews report the OS preference inconsistently.
 */
export const resolveAppearance = (
  requested: TAppearance = appearance,
): TResolvedAppearance => {
  if (requested === "system") {
    return NativeAppearance.getColorScheme() === "dark" ? "dark" : "light";
  }
  return requested;
};

/**
 * Sets how surveys render. Callable before `setup()`, never queued. An unknown value logs a warning
 * and falls back to light instead of throwing, as a bad value must not break the host app.
 */
export const setAppearance = (value: unknown): void => {
  if (isAppearance(value)) {
    appearance = value;
  } else {
    Logger.getInstance().error(
      `setAppearance: unknown appearance "${String(value)}", falling back to light`,
    );
    appearance = "light";
  }
  for (const listener of listeners) listener();
};

/** Calls `listener` whenever `setAppearance` runs. Returns the unsubscribe function. */
export const subscribeToAppearance = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Calls `listener` with the resolved value whenever it may have changed: on `setAppearance`, and,
 * while the request is `"system"`, on a change of the app's theme. The native listener exists only
 * while `"system"` is requested and is removed on the returned unsubscribe, so a closed survey
 * holds no listener.
 */
export const watchResolvedAppearance = (
  listener: (resolved: TResolvedAppearance) => void,
): (() => void) => {
  let removeNativeListener: (() => void) | undefined;

  const sync = (): void => {
    removeNativeListener?.();
    removeNativeListener = undefined;
    if (appearance === "system") {
      const subscription = NativeAppearance.addChangeListener(() => {
        listener(resolveAppearance());
      });
      removeNativeListener = () => {
        subscription.remove();
      };
    }
    listener(resolveAppearance());
  };

  const unsubscribe = subscribeToAppearance(sync);
  sync();

  return () => {
    unsubscribe();
    removeNativeListener?.();
  };
};

/** Test-only: back to the cold-start state. */
export const resetAppearance = (): void => {
  appearance = "light";
  listeners.clear();
};
