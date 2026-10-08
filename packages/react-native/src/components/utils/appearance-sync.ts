import type { TResolvedAppearance } from "@/lib/common/appearance";

/**
 * Decides when an open survey's appearance has to be sent to the renderer.
 *
 * Until the renderer reports `onSurveyRendered` there is no `formbricksSurveys.setAppearance` to
 * call, so an injection would be a no-op. Changes made meanwhile therefore wait, and the rendered
 * handshake sends the latest one. Each method returns the value to inject, or `undefined` when
 * nothing needs sending; a returned value is recorded as applied.
 */
export interface TAppearanceSync {
  /** A survey is shown with `initial` baked into its HTML; it has not rendered yet. */
  reset: (initial: TResolvedAppearance) => void;
  /** The resolved appearance changed while the survey is shown. */
  onChange: (resolved: TResolvedAppearance) => TResolvedAppearance | undefined;
  /** The renderer exists; `current` is the appearance resolved right now. */
  onRendered: (current: TResolvedAppearance) => TResolvedAppearance | undefined;
}

export const createAppearanceSync = (): TAppearanceSync => {
  let rendered = false;
  let applied: TResolvedAppearance = "light";

  const sendIfChanged = (
    resolved: TResolvedAppearance,
  ): TResolvedAppearance | undefined => {
    if (resolved === applied) return undefined;
    applied = resolved;
    return resolved;
  };

  return {
    reset: (initial) => {
      rendered = false;
      applied = initial;
    },
    onChange: (resolved) => (rendered ? sendIfChanged(resolved) : undefined),
    onRendered: (current) => {
      rendered = true;
      return sendIfChanged(current);
    },
  };
};
