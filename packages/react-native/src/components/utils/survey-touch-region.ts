import { z } from "zod";

/**
 * Where the survey card is, as the renderer reports it through `onCardRectChange`. CSS pixels,
 * which the viewport (`initial-scale=1.0`) makes equal to React Native points.
 */
export const ZCardRect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type TCardRect = z.infer<typeof ZCardRect>;

/**
 * The card's state, in three values rather than two:
 * - `undefined` — no report yet. An older self-hosted server serves a renderer that never calls
 *   `onCardRectChange`, and then the survey must keep blocking the host exactly as it always did.
 * - a rect — only the card takes touches.
 * - `null` — no card on screen (it is animating out), so nothing takes touches.
 *
 * Conflating the first and last is what once made the Flutter SDK's card untappable.
 */
export type TCardState = TCardRect | null | undefined;

/** Reads a `CardRect` bridge message. Returns `undefined` for anything malformed, so junk changes nothing. */
export const parseCardRectMessage = (
  data: unknown,
): TCardRect | null | undefined => {
  if (data === null) return null;
  const parsed = ZCardRect.safeParse(data);
  return parsed.success ? parsed.data : undefined;
};

interface TAbsoluteFrame {
  position: "absolute";
  left: number;
  top: number;
  width?: number;
  height?: number;
  right?: number;
  bottom?: number;
  overflow?: "hidden";
}

const FILL: TAbsoluteFrame = {
  position: "absolute",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
};

/**
 * Styles for the two views around the WebView on the no-overlay path.
 *
 * The WebView is never resized: the renderer caps the card's content at 60dvh of the WebView's
 * own viewport, so shrinking the WebView to the card shrinks the card with it and the two settle
 * at a clipped height. Instead a "window" view sits at the card's rect with `overflow: hidden`,
 * holding the full-size WebView offset by -x/-y so only the card shows through. React Native
 * hit-testing respects that clip, so a touch outside the window reaches the host app.
 */
export const getPassthroughFrames = (
  card: TCardState,
  hostSize: { width: number; height: number },
): { window: TAbsoluteFrame; webViewFrame: TAbsoluteFrame } => {
  // No report yet, or the host area is not measured: cover everything and block, as before.
  if (card === undefined || hostSize.width === 0) {
    return { window: FILL, webViewFrame: FILL };
  }

  // A null card collapses the window to nothing, so it claims no touches at all.
  const rect = card ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    window: {
      position: "absolute",
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      overflow: "hidden",
    },
    webViewFrame: {
      position: "absolute",
      left: -rect.x,
      top: -rect.y,
      width: hostSize.width,
      height: hostSize.height,
    },
  };
};

/**
 * Android only: how far the keyboard reaches up into the survey's host area, both edges in
 * window coordinates.
 *
 * Measured against the host's own bottom edge, not the window's: an edge-to-edge app (Expo's
 * default) does not shrink for the keyboard, so the host reaches the bottom and needs the whole
 * keyboard; an app whose window still resizes (`adjustResize` without edge-to-edge) has already
 * lost that height and needs nothing more. The keyboard's reported `height` leaves out the gesture
 * bar under it, so its top comes from `screenY`. KeyboardAvoidingView is no help: it recomputes
 * from the hide event too, whose `screenY` sits above the navigation bar, and leaves a gap.
 */
export const androidKeyboardPadding = (
  hostBottom: number,
  keyboardTop: number,
): number => Math.max(0, hostBottom - keyboardTop);
