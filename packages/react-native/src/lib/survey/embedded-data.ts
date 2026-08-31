import { Logger } from "@/lib/common/logger";
import type { TIngestedFieldsRecord } from "@/types/response";

/** What a host app may hand to `setEmbeddedData`. `null` removes the key; `undefined` is a no-op. */
export type TEmbeddedDataInput = Record<
  string,
  string | number | boolean | Date | null | undefined
>;

/**
 * The in-memory Embedded Data bag (ENG-1844/2472): context a host app attaches to future responses
 * without tying it to a trigger — `setEmbeddedData({ screen: "checkout" })` once, instead of
 * repeating the same values on every possible `track()` call. Mirrors js-core's store so the web and
 * mobile SDKs behave identically, key for key.
 *
 * Lifetime rules, all deliberate:
 *
 * - **In-memory, process scoped, never persisted.** Not `RNConfig`: that class writes to async
 *   storage, and persisting this bag would blur the Embedded Data ↔ contact-attribute boundary and
 *   create a stale-data / PII-at-rest surface. A cold app start begins empty; the host re-pushes.
 * - **Snapshot at display, then frozen.** `SurveyWebView` copies the bag into the survey's
 *   `hiddenFieldsRecord` when the survey is shown; a later `setEmbeddedData` affects the next
 *   response, never the one on screen.
 * - **No filtering here.** The SDK is a dumb pipe: the renderer applies the ingest contract —
 *   allow-list, coercion, `locked`, size caps — and logs what it refuses, and the server re-runs all
 *   of it on ingest. Filtering here would ship a second copy of those rules for the four mobile SDKs
 *   to drift from.
 * - **No network.** Every method is a synchronous memory write, so calling `setEmbeddedData` on
 *   every screen change is free. Values ride the existing response payload.
 *
 * Backed by a `Map` rather than a plain object so a `__proto__` key is stored as data instead of
 * vanishing into the prototype — the same hole the ingest contract closes on the renderer side.
 */
export class EmbeddedDataStore {
  private static instance: EmbeddedDataStore | undefined;
  private readonly data = new Map<string, string | number | boolean | Date>();

  static getInstance(): EmbeddedDataStore {
    EmbeddedDataStore.instance ??= new EmbeddedDataStore();
    return EmbeddedDataStore.instance;
  }

  /**
   * Merge — never replace — so refreshing a volatile field (`screen`) cannot wipe the stable ones
   * (`plan`) set at launch. Per key: last write wins; `null` removes; `undefined` does nothing.
   *
   * The `undefined` no-op is a documented promise, not an accident: a host that builds the object
   * from its own state passes every field unconditionally, so a key that is absent on the current
   * screen arrives as `undefined` and must not clear the value a previous screen set.
   */
  public setEmbeddedData(data: TEmbeddedDataInput): void {
    // Guarded rather than thrown: this is a synchronous entry point outside the command queue's
    // shield, and a host can legitimately hand over a value that was not there. A broken host build
    // is a worse failure than a skipped write. An array is refused too (`typeof [] === "object"`):
    // it would spread into junk numeric keys ({0: "a", 1: "b"}).
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      Logger.getInstance().error(
        `setEmbeddedData: expected an object, got ${data === null ? "null" : typeof data} — nothing was set`,
      );
      return;
    }

    const set: string[] = [];
    const removed: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (value === null) {
        this.data.delete(key);
        removed.push(key);
        continue;
      }
      // Refused rather than stored: `toISOString()` throws a RangeError on an invalid Date, and
      // `getSnapshot` runs inside the effect that displays the survey — so one `new Date("nope")`
      // from host code would cost the survey, not the field. This guard exists here and not in
      // js-core because serializing the Date is this SDK's own step: js-core hands the Date object
      // straight to the renderer, which coerces it. Never fatal, always logged.
      if (value instanceof Date && Number.isNaN(value.getTime())) {
        Logger.getInstance().error(
          `setEmbeddedData: "${key}" is an invalid Date — the key was skipped`,
        );
        continue;
      }
      this.data.set(key, value);
      set.push(key);
    }

    // A success trace, because the bag is otherwise invisible: it lives in memory (nothing in async
    // storage to inspect) and the API has no getter, so without this line a developer wiring up
    // `setEmbeddedData` gets zero confirmation until a survey happens to display. Debug level, which
    // this SDK gates on `__DEV__`, so a release build never prints it. Keys only, never values — the
    // documented use of this bag includes hashed identity fields.
    const removedSegment =
      removed.length > 0 ? `, removed [${removed.join(", ")}]` : "";
    Logger.getInstance().debug(
      `setEmbeddedData: set [${set.join(", ")}]${removedSegment} — the bag now holds [${[...this.data.keys()].join(", ")}]. Keys land on a response only if the survey declares them as ingested Embedded Data fields.`,
    );
  }

  /**
   * Remove one key, or everything when called with no argument (logout / hard context switch).
   *
   * "No argument" and "an argument that evaluated to `undefined`" are deliberately different: a host
   * reading the key from its own state must not wipe the whole bag when that state is empty, so
   * only a literal zero-argument call clears everything.
   */
  public clearEmbeddedData(...args: [] | [key: string]): void {
    if (args.length === 0) {
      const clearedCount = this.data.size;
      this.data.clear();
      Logger.getInstance().debug(
        `clearEmbeddedData: cleared the whole bag (${String(clearedCount)} keys)`,
      );
      return;
    }

    const [key] = args;
    if (typeof key !== "string") {
      Logger.getInstance().error(
        "clearEmbeddedData: expected a field name — nothing was cleared (call with no argument to clear everything)",
      );
      return;
    }

    this.data.delete(key);
    Logger.getInstance().debug(
      `clearEmbeddedData: removed "${key}" — the bag now holds [${[...this.data.keys()].join(", ")}]`,
    );
  }

  /**
   * A detached copy for the display-time snapshot: mutating the bag after a survey rendered must not
   * reach that survey's response. `Object.fromEntries` defines own properties, so a `__proto__` key
   * survives the conversion as data.
   *
   * Dates are serialized here rather than at the JSON boundary: `renderHtml` stringifies the props
   * blob, and an ISO 8601 string is exactly what the renderer's ingest contract accepts for a `date`
   * field. `setEmbeddedData` refuses an invalid Date, so `toISOString` here cannot throw.
   *
   * The return type spells booleans rather than asserting them away: the bag really does hold them,
   * the renderer's contract really does accept them, and only the legacy `TResponseData` could not
   * say so.
   */
  public getSnapshot(): TIngestedFieldsRecord {
    return Object.fromEntries(
      Array.from(this.data, ([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    );
  }
}
