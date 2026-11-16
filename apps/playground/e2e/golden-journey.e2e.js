/**
 * The golden journey shared by every Formbricks SDK, against the E2E server harness (e2e/server at
 * the repository root).
 *
 * e2e/server/seed.sh created the survey: NPS (qa_nps) then open text (qa_feedback), triggered by
 * `qa-action` and targeted to plan = pro. e2e/server/assert-response.sh then checks the stored
 * response through the V1 API, so the journey must use the same E2E_USER_ID and E2E_FEEDBACK.
 *
 * Env: E2E_APP_URL (Android emulator: http://10.0.2.2:3000; iOS: the tunnel URL), E2E_USER_ID,
 * E2E_FEEDBACK, optional E2E_WORKSPACE_ID.
 */
const { by, device, element, expect, waitFor, web } = require("detox");
const { poll } = require("./support/poll");

/** The app is gone (crashed or killed): no amount of waiting helps, so fail the attempt now. */
const appIsGone = (error) =>
  /can't seem to connect to the test app/.test(String(error?.message));
const until = (attempt, options) =>
  poll(attempt, { isFatal: appIsGone, ...options });

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} for the golden journey`);
  return value;
};

const appUrl = required("E2E_APP_URL");
const userId = required("E2E_USER_ID");
const feedback = required("E2E_FEEDBACK");
const workspaceId =
  process.env.E2E_WORKSPACE_ID ?? "clsdkqaws00000000000000001";

// Selectors: the survey renderer's DOM, the same in every SDK's WebView.
const NPS_9 = "//input[@name='qa_nps' and @value='9']/parent::label";
const FEEDBACK_INPUT = "#qa_feedback-input";
const THANKS_HEADLINE =
  "//*[@data-fb-part='headline'][contains(normalize-space(.), 'Thanks!')]";
const CLOSE_BUTTON = "[data-fb-part='button-close']";
const primaryButton = (card) =>
  `#questionCard-${card} [data-fb-part='button-primary']`;

const SURVEY_OPEN_TIMEOUT_MS = 150_000;
const TRACK_RETRY_INTERVAL_MS = 10_000;
const STEP_TIMEOUT_MS = 30_000;
const RESPONSE_TIMEOUT_MS = 60_000;

// The SDK's WebView is the only one in the app, so `web` needs no matcher.
const webElement = (matcher) => web.element(matcher);

const expectStatus = (text) =>
  waitFor(element(by.id("status")))
    .toHaveText(text)
    .withTimeout(STEP_TIMEOUT_MS);

const fill = async (testID, text) => {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .whileElement(by.id("playground-scroll"))
    .scroll(150, "down");
  await element(by.id(testID)).replaceText(text);
  // iOS leaves the keyboard up, and the survey would open underneath it.
  if (device.getPlatform() === "ios")
    await element(by.id(testID)).tapReturnKey();
};

const tap = async (testID) => {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .whileElement(by.id("playground-scroll"))
    .scroll(150, "down");
  await element(by.id(testID)).tap();
};

/**
 * Clicks a survey element. Android: Espresso-Web's click. iOS: the element's own click(), which
 * runs the browser's activation behavior (a <label> selects its radio); Detox's iOS web tap only
 * dispatches synthetic mouse events.
 */
const press = (matcher) =>
  device.getPlatform() === "ios"
    ? webElement(matcher).runScript("(el) => el.click()")
    : webElement(matcher).tap();

/**
 * Runs `fn` (a function source taking the element and `args`) in the WebView and returns its
 * result as a string. Detox for iOS passes a runScript result back only when it is a string (a
 * boolean comes back undefined), and hands an empty string over as `{ result: "" }`.
 */
const read = async (matcher, fn, args = []) => {
  const result = await webElement(matcher).runScript(
    `(el, ...args) => String((${fn})(el, ...args))`,
    args,
  );
  return typeof result === "string" ? result : (result?.result ?? "");
};

/**
 * Types into a survey text field. Android: Espresso-Web's key events. iOS: Detox's web typing left
 * the field empty, so the value is set the way the browser does it and an input event follows,
 * which is what the renderer listens to.
 */
const typeInto = (matcher, text) =>
  device.getPlatform() === "ios"
    ? read(
        matcher,
        `(el, text) => {
          const proto = Object.getPrototypeOf(el);
          Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return el.value;
        }`,
        [text],
      )
    : webElement(matcher).replaceText(text);

/** Whether any WebView is on screen: the survey's is the only one. */
const webViewExists = async () => {
  try {
    await webElement(by.web.tag("body")).runScript("() => true");
    return true;
  } catch {
    return false;
  }
};

const SETTLE_MS = 2_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The native WebView first, then a short settle, then the DOM: a web query that lands while the
 * WebView is still being created can take the app down on a cold Android emulator.
 */
const surveyIsOpen = async () => {
  const webViewClass =
    device.getPlatform() === "ios" ? "WKWebView" : "android.webkit.WebView";
  await expect(element(by.type(webViewClass))).toExist();
  await sleep(SETTLE_MS);
  await expect(webElement(by.web.xpath(NPS_9))).toExist();
};

/**
 * One pass of steps 2 and 3, then a short wait for the survey. A pass can land before the SDK has
 * finished setting up (the SDK then drops the calls), so a pass that opens nothing is repeated, as
 * a person would. Repeating is safe: a repeat setup, userId or attribute is a no-op.
 */
const identifyAndTrackUntilTheSurveyOpens = () => {
  let pass = 0;
  return until(
    async () => {
      pass += 1;
      // A failed setup (a dropped request through the tunnel) is retried by setting up again.
      if (pass > 1) await setUp();
      await tap("set-user-id-button");
      await expectStatus(`setUserId(${userId}) done`);
      await tap("set-attribute-button");
      await expectStatus("setAttribute(plan=pro) done");
      await tap("track-action-button");
      await expectStatus("track(qa-action) done");
      await until(surveyIsOpen, {
        what: "the survey",
        timeoutMs: TRACK_RETRY_INTERVAL_MS,
      });
    },
    {
      what: "the survey to open after track(qa-action)",
      timeoutMs: SURVEY_OPEN_TIMEOUT_MS,
      intervalMs: 1_000,
    },
  );
};

const setUp = async () => {
  await tap("setup-button");
  await expectStatus(`Set up with ${appUrl} ${workspaceId}`);
};

describe("golden journey", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: true });
    // The SDK keeps timers and the WebView busy, so Detox would wait for "idle" forever. Every
    // step waits explicitly instead (waitFor and poll).
    await device.disableSynchronization();
  });

  it("identifies, targets, triggers, answers and closes the survey", async () => {
    // 1. Set up the SDK against the harness server.
    await fill("app-url-input", appUrl);
    await fill("workspace-id-input", workspaceId);
    await setUp();

    // 2. setUserId and setAttribute(plan = pro); 3. track('qa-action'); 4. the survey appears.
    await fill("user-id-input", userId);
    await fill("attribute-key-input", "plan");
    await fill("attribute-value-input", "pro");
    await fill("action-input", "qa-action");
    await identifyAndTrackUntilTheSurveyOpens();

    // 5. Answer NPS 9 and the open text, finish, then close the ending card.
    await until(
      async () => {
        await press(by.web.xpath(NPS_9));
        const checked = await read(
          by.web.cssSelector("input[name='qa_nps'][value='9']"),
          "(input) => input.parentElement.dataset.checked",
        );
        if (checked !== "true") throw new Error("NPS 9 is not selected");
      },
      { what: "NPS 9 to be selected", timeoutMs: STEP_TIMEOUT_MS },
    );
    await until(() => press(by.web.cssSelector(primaryButton(0))), {
      what: "Next",
      timeoutMs: STEP_TIMEOUT_MS,
    });

    await until(
      async () => {
        await typeInto(by.web.cssSelector(FEEDBACK_INPUT), feedback);
        const typed = await read(
          by.web.cssSelector(FEEDBACK_INPUT),
          "(input) => input.value",
        );
        if (typed !== feedback) throw new Error(`the input holds "${typed}"`);
      },
      { what: "the open-text answer", timeoutMs: STEP_TIMEOUT_MS },
    );
    await until(() => press(by.web.cssSelector(primaryButton(1))), {
      what: "Finish",
      timeoutMs: STEP_TIMEOUT_MS,
    });

    // The ending card renders its headline only once the server accepted the response.
    await until(
      () => expect(webElement(by.web.xpath(THANKS_HEADLINE))).toExist(),
      { what: "the Thanks! card", timeoutMs: RESPONSE_TIMEOUT_MS },
    );

    // Closing removes the WebView the tap runs in, so the tap itself may report an error even
    // though it worked; only the outcome counts.
    await until(
      async () => {
        await press(by.web.cssSelector(CLOSE_BUTTON)).catch(() => {});
        await until(
          async () => {
            if (await webViewExists()) throw new Error("the survey is open");
          },
          { what: "the survey to close", timeoutMs: 3_000 },
        );
      },
      { what: "the survey to close", timeoutMs: STEP_TIMEOUT_MS },
    );
  });
});
