import { beforeEach, describe, expect, test, vi } from "vitest";
import { EmbeddedDataStore } from "@/lib/survey/embedded-data";

// The guards log through Logger; mocked so refused inputs don't spray the test output.
vi.mock("@/lib/common/logger", () => ({
  Logger: { getInstance: vi.fn(() => ({ error: vi.fn(), debug: vi.fn() })) },
}));

type TSetInput = Parameters<EmbeddedDataStore["setEmbeddedData"]>[0];

describe("EmbeddedDataStore", () => {
  let store: EmbeddedDataStore;

  beforeEach(() => {
    store = EmbeddedDataStore.getInstance();
    store.clearEmbeddedData();
  });

  test("merges instead of replacing: setting one key keeps the others", () => {
    store.setEmbeddedData({ plan: "pro", screen: "product" });
    store.setEmbeddedData({ screen: "checkout" });

    expect(store.getSnapshot()).toEqual({ plan: "pro", screen: "checkout" });
  });

  test("null drops the key", () => {
    store.setEmbeddedData({ plan: "pro", screen: "product" });
    store.setEmbeddedData({ screen: null });

    expect(store.getSnapshot()).toEqual({ plan: "pro" });
  });

  // One keystroke away from `null` and the opposite behavior: a host that builds the object from
  // its own state passes every field unconditionally, so a key absent on the current screen
  // arrives as `undefined` and must not clear what a previous screen set.
  test("undefined is a no-op — does not set, does not drop", () => {
    store.setEmbeddedData({ plan: "pro" });
    store.setEmbeddedData({ plan: undefined, screen: undefined });

    expect(store.getSnapshot()).toEqual({ plan: "pro" });
  });

  test("clearEmbeddedData(key) removes one key, clearEmbeddedData() removes everything", () => {
    store.setEmbeddedData({ plan: "pro", screen: "product", seats: 4 });

    store.clearEmbeddedData("screen");
    expect(store.getSnapshot()).toEqual({ plan: "pro", seats: 4 });

    store.clearEmbeddedData();
    expect(store.getSnapshot()).toEqual({});
  });

  test("last write wins per key", () => {
    store.setEmbeddedData({ plan: "free" });
    store.setEmbeddedData({ plan: "pro" });

    expect(store.getSnapshot()).toEqual({ plan: "pro" });
  });

  test("snapshot is a detached copy: later writes do not reach an earlier snapshot", () => {
    // The freeze that "a value set after a survey is displayed does not change that response"
    // rests on — `SurveyWebView` holds exactly this object for the life of the survey.
    store.setEmbeddedData({ plan: "pro" });
    const snapshot = store.getSnapshot();

    store.setEmbeddedData({ plan: "enterprise", extra: "later" });

    expect(snapshot).toEqual({ plan: "pro" });
  });

  test("booleans survive and dates serialize to ISO 8601, which the ingest contract accepts", () => {
    store.setEmbeddedData({
      isTrial: true,
      signedUpAt: new Date("2026-08-20T10:00:00.000Z"),
    });

    expect(store.getSnapshot()).toEqual({
      isTrial: true,
      signedUpAt: "2026-08-20T10:00:00.000Z",
    });
  });

  test("a __proto__ key is stored as data, not swallowed by the prototype", () => {
    store.setEmbeddedData({ ["__proto__"]: "value" });

    const snapshot = store.getSnapshot();
    // Read through the descriptor rather than the dot: it proves the key landed as an own DATA
    // property, which `snapshot.__proto__` cannot distinguish from the inherited accessor.
    expect(Object.getOwnPropertyDescriptor(snapshot, "__proto__")?.value).toBe(
      "value",
    );
    expect(Object.keys({})).toEqual([]);
  });

  test("makes no network calls — it is a synchronous memory write", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    store.setEmbeddedData({ plan: "pro", secret: "value" });
    store.clearEmbeddedData("secret");
    store.getSnapshot();
    store.clearEmbeddedData();

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("input guards (never fatal)", () => {
  let store: EmbeddedDataStore;

  beforeEach(() => {
    store = EmbeddedDataStore.getInstance();
    store.clearEmbeddedData();
  });

  test("setEmbeddedData(null) and (undefined) do not throw into host code and set nothing", () => {
    store.setEmbeddedData({ plan: "pro" });

    expect(() => {
      store.setEmbeddedData(null as unknown as TSetInput);
      store.setEmbeddedData(undefined as unknown as TSetInput);
    }).not.toThrow();

    expect(store.getSnapshot()).toEqual({ plan: "pro" });
  });

  test("a primitive argument is refused instead of spreading into junk keys", () => {
    store.setEmbeddedData("plan" as unknown as TSetInput);

    expect(store.getSnapshot()).toEqual({});
  });

  test('an array is refused too — typeof [] is "object", but it would spread into numeric junk keys', () => {
    store.setEmbeddedData(["a", "b"] as unknown as TSetInput);

    expect(store.getSnapshot()).toEqual({});
  });

  test("clearEmbeddedData(undefined) is a no-op, NOT a full clear — one keystroke from the no-arg overload", () => {
    store.setEmbeddedData({ plan: "pro", screen: "product" });

    store.clearEmbeddedData(undefined as unknown as string);

    expect(store.getSnapshot()).toEqual({ plan: "pro", screen: "product" });
  });
});
