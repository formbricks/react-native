import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getColorScheme = vi.fn();
const addChangeListener = vi.fn();

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Appearance: {
    getColorScheme: (): unknown => getColorScheme(),
    addChangeListener: (cb: () => void): unknown => addChangeListener(cb),
  },
}));

const load = async () => import("@/lib/common/appearance");

describe("appearance", () => {
  const remove = vi.fn();

  beforeEach(() => {
    addChangeListener.mockReturnValue({ remove });
    getColorScheme.mockReturnValue("light");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("defaults to light", async () => {
    const { getAppearance, resolveAppearance } = await load();
    expect(getAppearance()).toBe("light");
    expect(resolveAppearance()).toBe("light");
  });

  test("light and dark win over the app theme", async () => {
    getColorScheme.mockReturnValue("dark");
    const { setAppearance, resolveAppearance } = await load();
    setAppearance("light");
    expect(resolveAppearance()).toBe("light");
    getColorScheme.mockReturnValue("light");
    setAppearance("dark");
    expect(resolveAppearance()).toBe("dark");
  });

  test('"system" resolves to the app theme and never to "system"', async () => {
    const { setAppearance, resolveAppearance } = await load();
    setAppearance("system");
    getColorScheme.mockReturnValue("dark");
    expect(resolveAppearance()).toBe("dark");
    getColorScheme.mockReturnValue(null);
    expect(resolveAppearance()).toBe("light");
  });

  test("an unknown value falls back to light without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { setAppearance, getAppearance } = await load();
    setAppearance("dark");
    expect(() => {
      setAppearance("sepia");
    }).not.toThrow();
    expect(getAppearance()).toBe("light");
  });

  test("watchResolvedAppearance reports setAppearance changes", async () => {
    const { setAppearance, watchResolvedAppearance } = await load();
    const listener = vi.fn();
    const stop = watchResolvedAppearance(listener);
    expect(listener).toHaveBeenLastCalledWith("light");
    setAppearance("dark");
    expect(listener).toHaveBeenLastCalledWith("dark");
    stop();
    listener.mockClear();
    setAppearance("light");
    expect(listener).not.toHaveBeenCalled();
  });

  test('"system" follows live app theme changes and removes its listener on stop', async () => {
    const { setAppearance, watchResolvedAppearance } = await load();
    setAppearance("system");
    const listener = vi.fn();
    const stop = watchResolvedAppearance(listener);
    expect(addChangeListener).toHaveBeenCalledTimes(1);

    getColorScheme.mockReturnValue("dark");
    (addChangeListener.mock.calls[0]?.[0] as () => void)();
    expect(listener).toHaveBeenLastCalledWith("dark");

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('leaving "system" drops the native listener', async () => {
    const { setAppearance, watchResolvedAppearance } = await load();
    setAppearance("system");
    const stop = watchResolvedAppearance(vi.fn());
    setAppearance("dark");
    expect(remove).toHaveBeenCalledTimes(1);
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
