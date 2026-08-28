import { describe, expect, test, vi } from "vitest";
import { renderHtml } from "@/components/survey-web-view";

// The shared setup mocks `react-native` down to `Platform` only; this module also reaches for
// view primitives and calls `StyleSheet.create` at import time, so widen the mock here.
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: () => null,
  Linking: { openURL: vi.fn() },
  Modal: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
  View: () => null,
}));

const harness = (appUrl = "https://app.formbricks.com"): string =>
  renderHtml({ appUrl, workspaceId: "ws-1" });

describe("WebView harness", () => {
  test("defines an onFinished bridge function", () => {
    expect(harness()).toContain("function onFinished()");
  });

  test("posts the onFinished message back to the host", () => {
    expect(harness()).toContain(
      "window.ReactNativeWebView.postMessage(JSON.stringify({ onFinished: true }))",
    );
  });

  /**
   * Defining the function is not enough — the surveys library only calls it if it is handed in
   * as a prop. Without this assertion the harness could define onFinished and never wire it up.
   */
  test("passes onFinished into renderSurvey's props", () => {
    const html = harness();
    const propsBlock = html.slice(
      html.indexOf("const surveyProps = {"),
      html.indexOf("window.formbricksSurveys.renderSurvey"),
    );

    expect(propsBlock).toContain("onFinished,");
    // The other lifecycle props must survive alongside it.
    expect(propsBlock).toContain("onDisplayCreated,");
    expect(propsBlock).toContain("onResponseCreated,");
    expect(propsBlock).toContain("onClose,");
  });

  /**
   * The Embedded Data bag (ENG-1844/2472) rides the props blob that already exists — no new bridge
   * message. The blob is JSON, so this pins that the key survives serialization under the name the
   * renderer reads, with the SDK doing no filtering of its own: the renderer owns the allow-list.
   */
  test("carries hiddenFieldsRecord into the payload, raw and unfiltered", () => {
    const html = renderHtml({
      appUrl: "https://app.formbricks.com",
      workspaceId: "ws-1",
      hiddenFieldsRecord: {
        plan: "pro",
        notDeclaredBySurvey: "kept — the renderer decides, not the SDK",
      },
    });

    expect(html).toContain('"hiddenFieldsRecord":{');
    expect(html).toContain('"plan":"pro"');
    expect(html).toContain('"notDeclaredBySurvey"');
  });

  test("still escapes < in the payload so survey content cannot break out of the script", () => {
    const html = renderHtml({
      appUrl: "https://app.formbricks.com",
      workspaceId: "</script><script>alert(1)</script>",
    });

    expect(html).not.toContain("</script><script>alert(1)");
    // Each "<" is emitted as the literal six-character sequence \u003c.
    expect(html).toContain("\\u003c/script>");
  });
});
