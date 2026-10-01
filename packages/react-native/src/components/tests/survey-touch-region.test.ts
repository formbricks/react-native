import { describe, expect, test } from "vitest";
import {
  androidKeyboardPadding,
  getPassthroughFrames,
  parseCardRectMessage,
} from "@/components/utils/survey-touch-region";

/**
 * A no-overlay survey lets touches through by clipping the WebView to the card. These pin what
 * the clip covers in each state, because getting it wrong is invisible in review and obvious to a
 * user: either the host app freezes, or the survey itself stops responding.
 */
describe("getPassthroughFrames", () => {
  const host = { width: 400, height: 800 };
  const card = { x: 16, y: 500, width: 368, height: 280 };
  const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 };

  test("blocks everything until the renderer reports a rect", () => {
    // An older server never reports one, and the survey must keep blocking as it always did.
    const frames = getPassthroughFrames(undefined, host);

    expect(frames.window).toEqual(fill);
    expect(frames.webViewFrame).toEqual(fill);
  });

  test("keeps blocking until the host area is measured", () => {
    expect(getPassthroughFrames(card, { width: 0, height: 0 }).window).toEqual(
      fill,
    );
  });

  test("clips to the card and keeps the WebView full-size behind it", () => {
    const frames = getPassthroughFrames(card, host);

    expect(frames.window).toEqual({
      position: "absolute",
      left: 16,
      top: 500,
      width: 368,
      height: 280,
      overflow: "hidden",
    });
    // Offset back so the card lands inside the window, at the host's full size so the renderer
    // lays it out exactly as before.
    expect(frames.webViewFrame).toEqual({
      position: "absolute",
      left: -16,
      top: -500,
      width: 400,
      height: 800,
    });
  });

  test("claims nothing once the card has gone", () => {
    const frames = getPassthroughFrames(null, host);

    expect(frames.window.width).toBe(0);
    expect(frames.window.height).toBe(0);
    expect(frames.window.overflow).toBe("hidden");
  });
});

describe("parseCardRectMessage", () => {
  test("reads a rect, and null as no card", () => {
    expect(parseCardRectMessage({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(parseCardRectMessage(null)).toBeNull();
  });

  test("rejects malformed payloads rather than treating them as no card", () => {
    // Reading junk as `null` would make the survey untappable.
    expect(parseCardRectMessage({ x: "1", y: 2 })).toBeUndefined();
    expect(parseCardRectMessage(undefined)).toBeUndefined();
  });
});

describe("androidKeyboardPadding", () => {
  test("an edge-to-edge host makes room for the whole keyboard", () => {
    // The host still reaches the bottom of the screen, under the keyboard.
    expect(androidKeyboardPadding(914, 578)).toBe(336);
  });

  test("a host whose window already shrank for the keyboard needs nothing more", () => {
    // adjustResize without edge-to-edge: the host ends at the keyboard's top. Padding on top of
    // that would push the card a whole keyboard height too far.
    expect(androidKeyboardPadding(578, 578)).toBe(0);
  });

  test("only makes up the part of the host the keyboard covers", () => {
    expect(androidKeyboardPadding(700, 578)).toBe(122);
  });

  test("is never negative", () => {
    expect(androidKeyboardPadding(800, 914)).toBe(0);
  });
});
