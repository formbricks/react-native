import { describe, expect, test } from "vitest";
import { getSurveyScriptUrl } from "@/components/utils/survey-script-url";

describe("getSurveyScriptUrl()", () => {
  test("builds the default local development script URL", () => {
    expect(getSurveyScriptUrl()).toBe("http://localhost:3000/js/surveys.umd.cjs");
  });

  test("builds the script URL from a root-hosted appUrl", () => {
    expect(getSurveyScriptUrl("https://app.formbricks.com")).toBe(
      "https://app.formbricks.com/js/surveys.umd.cjs",
    );
  });

  test("preserves a path-based deployment without a trailing slash", () => {
    expect(getSurveyScriptUrl("https://host/formbricks")).toBe(
      "https://host/formbricks/js/surveys.umd.cjs",
    );
  });

  test("preserves a path-based deployment with a trailing slash", () => {
    expect(getSurveyScriptUrl("https://host/formbricks/")).toBe(
      "https://host/formbricks/js/surveys.umd.cjs",
    );
  });

  test("drops query and hash components from the script URL", () => {
    expect(getSurveyScriptUrl("https://host/formbricks?foo=bar#section")).toBe(
      "https://host/formbricks/js/surveys.umd.cjs",
    );
  });

  test("rejects non-http protocols", () => {
    expect(() => getSurveyScriptUrl("file:///tmp/formbricks")).toThrow(
      "Formbricks appUrl must use http or https",
    );
  });
});
