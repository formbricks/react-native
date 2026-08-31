import { z } from "zod";

export type TResponseData = Record<
  string,
  string | number | string[] | Record<string, string>
>;

export type TResponseTtc = Record<string, number>;

export type TResponseVariables = Record<string, string | number>;

export type TResponseHiddenFieldValue = Record<
  string,
  string | number | string[]
>;

/**
 * What the renderer accepts for `hiddenFieldsRecord`: the legacy shape plus the booleans its
 * Embedded Data ingest contract normalizes (`TIngestableScalar` is `string | number | boolean |
 * Date`) but that the older types cannot spell. Dates are serialized to ISO 8601 before they get
 * here, so they arrive as strings.
 *
 * Its own type rather than a cast to `TResponseData`: the store really does hold booleans, and an
 * assertion there would only hide the mismatch from the compiler while the value flows on regardless.
 */
export type TIngestedFieldsRecord = Record<
  string,
  string | number | boolean | string[] | Record<string, string>
>;

export interface TResponseUpdate {
  finished: boolean;
  data: TResponseData;
  language?: string;
  variables?: TResponseVariables;
  ttc?: TResponseTtc;
  meta?: { url?: string; source?: string; action?: string };
  hiddenFields?: TResponseHiddenFieldValue;
  displayId?: string | null;
  endingId?: string | null;
}

const ZNestedResponseData = z.record(z.string(), z.string());
export const ZResponseData = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.array(z.string()), ZNestedResponseData]),
);
export const ZResponseVariables = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);
export const ZResponseTtc = z.record(z.string(), z.number());
export const ZResponseHiddenFieldValue = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.array(z.string())]),
);

export const ZResponseUpdate = z.object({
  finished: z.boolean(),
  data: ZResponseData,
  language: z.string().optional(),
  variables: ZResponseVariables.optional(),
  ttc: ZResponseTtc.optional(),
  meta: z
    .object({
      url: z.string().optional(),
      source: z.string().optional(),
      action: z.string().optional(),
    })
    .optional(),
  hiddenFields: ZResponseHiddenFieldValue.optional(),
  displayId: z.string().nullish(),
  endingId: z.string().nullish(),
});
