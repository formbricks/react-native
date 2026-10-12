import { describe, expect, test } from "vitest";
import { createAppearanceSync } from "@/components/utils/appearance-sync";

describe("createAppearanceSync", () => {
  test("sends nothing before the survey has rendered", () => {
    const sync = createAppearanceSync();
    sync.reset("light");

    expect(sync.onChange("dark")).toBeUndefined();
    expect(sync.onChange("dark")).toBeUndefined();
  });

  /** The bug: a change made while the bundle loads was dropped, and later repeats deduplicated. */
  test("sends the latest value on render when it changed while loading", () => {
    const sync = createAppearanceSync();
    sync.reset("light");
    sync.onChange("dark");

    expect(sync.onRendered("dark")).toBe("dark");
    // Recorded as applied, so a repeat is a no-op.
    expect(sync.onChange("dark")).toBeUndefined();
  });

  test("sends nothing on render when the value matches the one baked into the HTML", () => {
    const sync = createAppearanceSync();
    sync.reset("dark");

    expect(sync.onRendered("dark")).toBeUndefined();
  });

  test("sends only real changes once rendered", () => {
    const sync = createAppearanceSync();
    sync.reset("light");
    sync.onRendered("light");

    expect(sync.onChange("light")).toBeUndefined();
    expect(sync.onChange("dark")).toBe("dark");
    expect(sync.onChange("dark")).toBeUndefined();
    expect(sync.onChange("light")).toBe("light");
  });

  test("reset for a new survey waits for that survey to render again", () => {
    const sync = createAppearanceSync();
    sync.reset("light");
    sync.onRendered("light");
    sync.reset("dark");

    expect(sync.onChange("light")).toBeUndefined();
    expect(sync.onRendered("light")).toBe("light");
  });
});
