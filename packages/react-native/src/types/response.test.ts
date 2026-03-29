import { describe, expect, test } from "vitest";
import { ZResponseData, ZResponseUpdate } from "@/types/response";

describe("response schemas", () => {
  test("accepts nested string records in response data", () => {
    const result = ZResponseData.safeParse({
      simple: "value",
      nested: {
        key: "value",
      },
    });

    expect(result.success).toBe(true);
  });

  test("accepts nested string records in response updates", () => {
    const result = ZResponseUpdate.safeParse({
      finished: true,
      data: {
        nested: {
          key: "value",
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
