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
};

const tap = async (testID) => {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .whileElement(by.id("playground-scroll"))
    .scroll(150, "down");
  await element(by.id(testID)).tap();
};

/** Whether any WebView is on screen: the survey's is the only one. */
const webViewExists = async () => {
  try {
    await webElement(by.web.tag("body")).runScript("() => true");
    return true;
  } catch {
    return false;
  }
};

const surveyIsOpen = () => expect(webElement(by.web.xpath(NPS_9))).toExist();

/**
 * One pass of steps 2 and 3, then a short wait for the survey. A pass can land before the SDK has
 * finished setting up (the SDK then drops the calls), so a pass that opens nothing is repeated, as
 * a person would. Repeating is safe: the same userId and attribute are no-ops the second time.
 */
const identifyAndTrackUntilTheSurveyOpens = () =>
  poll(
    async () => {
      await tap("set-user-id-button");
      await expectStatus(`setUserId(${userId}) done`);
      await tap("set-attribute-button");
      await expectStatus("setAttribute(plan=pro) done");
      await tap("track-action-button");
      await expectStatus("track(qa-action) done");
      await poll(surveyIsOpen, {
        what: "the survey",
        timeoutMs: TRACK_RETRY_INTERVAL_MS,
      });
    },
    {
      what: "the survey to open after track(qa-action)",
      timeoutMs: SURVEY_OPEN_TIMEOUT_MS,
      intervalMs: 0,
    },
  );

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
    await tap("setup-button");
    await expectStatus(`Set up with ${appUrl} ${workspaceId}`);

    // 2. setUserId and setAttribute(plan = pro); 3. track('qa-action'); 4. the survey appears.
    await fill("user-id-input", userId);
    await fill("attribute-key-input", "plan");
    await fill("attribute-value-input", "pro");
    await fill("action-input", "qa-action");
    await identifyAndTrackUntilTheSurveyOpens();

    // 5. Answer NPS 9 and the open text, finish, then close the ending card.
    await poll(() => webElement(by.web.xpath(NPS_9)).tap(), {
      what: "NPS option 9",
      timeoutMs: STEP_TIMEOUT_MS,
    });
    await poll(
      async () => {
        const selected = await webElement(
          by.web.cssSelector("input[name='qa_nps'][value='9']"),
        ).runScript(
          "(input) => input.parentElement.dataset.checked === 'true'",
        );
        if (!selected) throw new Error("NPS 9 is not selected");
      },
      { what: "NPS 9 to be selected", timeoutMs: STEP_TIMEOUT_MS },
    );
    await poll(() => webElement(by.web.cssSelector(primaryButton(0))).tap(), {
      what: "Next",
      timeoutMs: STEP_TIMEOUT_MS,
    });

    await poll(
      async () => {
        const input = webElement(by.web.cssSelector(FEEDBACK_INPUT));
        await input.replaceText(feedback);
        const typed = await input.runScript("(input) => input.value");
        if (typed !== feedback) throw new Error(`the input holds "${typed}"`);
      },
      { what: "the open-text answer", timeoutMs: STEP_TIMEOUT_MS },
    );
    await poll(() => webElement(by.web.cssSelector(primaryButton(1))).tap(), {
      what: "Finish",
      timeoutMs: STEP_TIMEOUT_MS,
    });

    // The ending card renders its headline only once the server accepted the response.
    await poll(
      () => expect(webElement(by.web.xpath(THANKS_HEADLINE))).toExist(),
      { what: "the Thanks! card", timeoutMs: RESPONSE_TIMEOUT_MS },
    );

    // Closing removes the WebView the tap runs in, so the tap itself may report an error even
    // though it worked; only the outcome counts.
    await poll(
      async () => {
        await webElement(by.web.cssSelector(CLOSE_BUTTON))
          .tap()
          .catch(() => {});
        await poll(
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
