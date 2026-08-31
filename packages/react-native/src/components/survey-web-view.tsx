import { type JSX, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  StyleSheet,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { getSurveyScriptUrl } from "@/components/utils/survey-script-url";
import { RNConfig } from "@/lib/common/config";
import { Logger } from "@/lib/common/logger";
import { filterSurveys, getLanguageCode, getStyling } from "@/lib/common/utils";
import { EmbeddedDataStore } from "@/lib/survey/embedded-data";
import { SurveyStore } from "@/lib/survey/store";
import { refreshSegmentsAfterInteraction } from "@/lib/user/interaction-refresh";
import { type TUserState, ZJsRNWebViewOnMessageData } from "@/types/config";
import type { TIngestedFieldsRecord } from "@/types/response";
import type { SurveyContainerProps, TSurvey } from "@/types/survey";

const logger = Logger.getInstance();
logger.configure({ logLevel: __DEV__ ? "debug" : "error" });

const surveyStore = SurveyStore.getInstance();

interface SurveyWebViewProps {
  readonly survey: TSurvey;
}

export function SurveyWebView(props: SurveyWebViewProps): JSX.Element | null {
  const webViewRef = useRef<WebView>(null);
  const [isSurveyRunning, setIsSurveyRunning] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [appConfig, setAppConfig] = useState<RNConfig | null>(null);
  const [languageCode, setLanguageCode] = useState("default");
  /**
   * The Embedded Data bag, snapshotted at the moment the survey is shown and frozen for the rest of
   * its life (ENG-1844). Held in state rather than read inline in the render pass on purpose: the
   * html string below is an *input* to the WebView, so reading a mutable bag while rendering would
   * let a later `setEmbeddedData` rewrite `source` and reload the WebView mid-survey — losing the
   * respondent's answers. A later write therefore reaches the next response, never this one.
   *
   * Set in the same update as `setShowSurvey(true)`, which is the delay-aware display moment
   * js-core snapshots at too (it builds its own bag inside the delay timeout).
   */
  const [embeddedDataSnapshot, setEmbeddedDataSnapshot] =
    useState<TIngestedFieldsRecord>({});

  useEffect(() => {
    const fetchConfig = async (): Promise<void> => {
      const config = await RNConfig.getInstance();
      setAppConfig(config);
    };

    void fetchConfig();
  }, []);

  const isMultiLanguageSurvey = props.survey.languages.length > 1;

  useEffect(() => {
    if (!appConfig) {
      return;
    }

    const language = appConfig.get().user.data.language;

    if (isMultiLanguageSurvey) {
      const displayLanguage = getLanguageCode(props.survey, language);
      if (!displayLanguage) {
        logger.debug(
          `Survey "${props.survey.id}" is not available in specified language.`,
        );
        setIsSurveyRunning(false);
        setShowSurvey(false);
        surveyStore.resetSurvey();
        return;
      }
      setLanguageCode(displayLanguage);
      setIsSurveyRunning(true);
    } else {
      setIsSurveyRunning(true);
    }
  }, [isMultiLanguageSurvey, props.survey, appConfig]);

  useEffect(() => {
    if (!isSurveyRunning) {
      setShowSurvey(false);
      return;
    }

    /**
     * Shows the survey, taking the Embedded Data snapshot in the same update.
     *
     * Both calls belong together and in this order: React batches them into one render, so the
     * WebView mounts with the bag already frozen rather than mounting empty and re-rendering with
     * it — which would change `source` and reload the survey. Called directly, or from the delay
     * timeout below, so the snapshot is always taken at the moment the survey actually appears.
     */
    const display = (): void => {
      setEmbeddedDataSnapshot(EmbeddedDataStore.getInstance().getSnapshot());
      setShowSurvey(true);
    };

    if (props.survey.delay) {
      logger.debug(
        `Delaying survey "${props.survey.id}" by ${String(props.survey.delay)} seconds`,
      );
      const timerId = setTimeout(display, props.survey.delay * 1000);

      return () => {
        clearTimeout(timerId);
      };
    }

    display();
  }, [props.survey.delay, isSurveyRunning, props.survey.id]);

  if (!appConfig) {
    return null;
  }

  const settings = appConfig.get().workspace.data.settings;
  const styling = getStyling(settings, props.survey);
  const isBrandingEnabled = settings.inAppSurveyBranding;

  const onCloseSurvey = (): void => {
    const { workspace, user: userState } = appConfig.get();
    const filteredSurveys = filterSurveys(workspace, userState);

    appConfig.update({
      ...appConfig.get(),
      workspace,
      user: userState,
      filteredSurveys,
    });

    surveyStore.resetSurvey();
    setShowSurvey(false);
  };

  const surveyPlacement =
    props.survey.projectOverwrites?.placement ?? settings.placement;
  const clickOutside =
    props.survey.projectOverwrites?.clickOutsideClose ??
    settings.clickOutsideClose;
  const overlay = props.survey.projectOverwrites?.overlay ?? settings.overlay;
  const appUrl = appConfig.get().appUrl;

  return (
    <Modal
      animationType="slide"
      visible={showSurvey}
      transparent
      onRequestClose={() => {
        setShowSurvey(false);
        setIsSurveyRunning(false);
      }}
    >
      <View style={styles.modalContainer}>
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.keyboardAvoidingView}
        >
          <WebView
            ref={webViewRef}
            originWhitelist={["https://*", "http://*"]}
            source={{
              html: renderHtml({
                workspaceId: appConfig.get().workspaceId,
                contactId: appConfig.get().user.data.contactId ?? undefined,
                survey: props.survey,
                isBrandingEnabled,
                styling,
                languageCode,
                placement: surveyPlacement,
                appUrl,
                clickOutside,
                overlay,
                isWebEnvironment: false,
                // Passed straight through, unfiltered: the Embedded Data ingest contract lives in
                // the renderer (ENG-1845/2472), so all four mobile SDKs inherit the same allow-list,
                // coercion and size rules without each shipping a copy. The renderer drops unknown
                // and locked keys and logs what it refused; the server re-runs all of it on ingest.
                hiddenFieldsRecord: embeddedDataSnapshot,
              }),
            }}
            style={styles.webView}
            contentMode="mobile"
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            scrollEnabled={false}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(event) => {
              if (isAllowedWebViewNavigation(event.url, appUrl)) {
                return true;
              }

              void openExternalUrl(event.url);
              return false;
            }}
            onMessage={(event: WebViewMessageEvent) => {
              try {
                const { data } = event.nativeEvent;
                const unvalidatedMessage = JSON.parse(data) as {
                  type: string;
                  data: unknown;
                };

                // debugger
                if (unvalidatedMessage.type === "Console") {
                  if (__DEV__) {
                    console.info(
                      `[Console] ${JSON.stringify(unvalidatedMessage.data)}`,
                    );
                  }
                  return;
                }

                const validatedMessage =
                  ZJsRNWebViewOnMessageData.safeParse(unvalidatedMessage);
                if (!validatedMessage.success) {
                  logger.error("Error parsing message from WebView.");
                  return;
                }

                const {
                  onClose,
                  onDisplayCreated,
                  onFinished,
                  onOpenExternalURL,
                  onOpenExternalURLParams,
                  onResponseCreated,
                } = validatedMessage.data;
                if (onDisplayCreated) {
                  const existingDisplays = appConfig.get().user.data.displays;
                  const newDisplay = {
                    surveyId: props.survey.id,
                    createdAt: new Date(),
                  };

                  const displays = [...existingDisplays, newDisplay];
                  const previousConfig = appConfig.get();

                  const updatedUserState = {
                    ...previousConfig.user,
                    data: {
                      ...previousConfig.user.data,
                      displays,
                      lastDisplayAt: new Date(),
                    },
                  };

                  const filteredSurveys = filterSurveys(
                    previousConfig.workspace,
                    updatedUserState,
                  );

                  appConfig.update({
                    ...previousConfig,
                    workspace: previousConfig.workspace,
                    user: updatedUserState,
                    filteredSurveys,
                  });

                  // A new display can flip "have seen X" / "have not seen X" segments. The
                  // optimistic update above keeps recontact/display-cap correct locally; this
                  // pulls fresh `segments` (gated + coalesced) so interaction targeting is
                  // current by the time this survey closes and the next trigger evaluates.
                  refreshSegmentsAfterInteraction(
                    previousConfig.user.data.userId,
                    props.survey,
                    "onDisplay",
                  );
                }
                if (onResponseCreated) {
                  const responses = appConfig.get().user.data.responses;
                  const newPersonState: TUserState = {
                    ...appConfig.get().user,
                    data: {
                      ...appConfig.get().user.data,
                      responses: [...responses, props.survey.id],
                    },
                  };

                  const filteredSurveys = filterSurveys(
                    appConfig.get().workspace,
                    newPersonState,
                  );

                  appConfig.update({
                    ...appConfig.get(),
                    workspace: appConfig.get().workspace,
                    user: newPersonState,
                    filteredSurveys,
                  });

                  // A created response flips "have started responding to X" segments. The
                  // "completed X" case is handled by onFinished below.
                  refreshSegmentsAfterInteraction(
                    appConfig.get().user.data.userId,
                    props.survey,
                    "onResponse",
                  );
                }
                if (onFinished) {
                  // Survey completion flips "have completed X" (and clears "have not completed
                  // X") segments. The surveys library only fires this after the finished
                  // response has been sent, so the server recompute sees finished=true.
                  refreshSegmentsAfterInteraction(
                    appConfig.get().user.data.userId,
                    props.survey,
                    "onFinished",
                  );
                }
                if (onOpenExternalURL && onOpenExternalURLParams?.url) {
                  void openExternalUrl(onOpenExternalURLParams.url);
                }
                if (onClose) {
                  onCloseSurvey();
                }
              } catch (error) {
                logger.error(
                  `Error handling WebView message: ${error as string}`,
                );
              }
            }}
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const isAllowedWebViewNavigation = (
  candidateUrl: string,
  appUrl: string,
): boolean => {
  if (candidateUrl === "about:blank") {
    return true;
  }

  try {
    const allowedOrigin = new URL(appUrl).origin;
    return new URL(candidateUrl).origin === allowedOrigin;
  } catch {
    return false;
  }
};

const openExternalUrl = async (candidateUrl: string): Promise<void> => {
  try {
    const url = new URL(candidateUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      logger.error(
        `Blocked unsupported external URL protocol: ${url.protocol}`,
      );
      return;
    }

    await Linking.openURL(url.toString());
  } catch (error) {
    logger.error(`Failed to open external URL: ${error as string}`);
  }
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
});

/** Exported for tests — not re-exported from the package entry point. */
export const renderHtml = (
  options: Partial<SurveyContainerProps> & { appUrl?: string },
): string => {
  const surveyScriptUrl = getSurveyScriptUrl(options.appUrl);

  if (!surveyScriptUrl) {
    return `
  <!doctype html>
  <html>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0">
    <head>
      <title>Formbricks WebView Survey</title>
    </head>
    <body style="overflow: hidden; height: 100vh; margin: 0;">
    </body>
  </html>
  `;
  }

  // Escape "<" so survey content can't inject "</script>" (or "<script"/"<!--") and break
  // out of the inline <script> below: "<" occurs only inside JSON string values, and the
  // WebView's JS engine decodes the escaped "<" back to a literal "<" when parsing the
  // object literal, so the payload is preserved exactly. See ENG-1813.
  const optionsJson = JSON.stringify(options).replaceAll(
    "<",
    String.raw`\u003c`,
  );

  return `
  <!doctype html>
  <html>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0">
    <head>
      <title>Formbricks WebView Survey</title>
    </head>
    <body style="overflow: hidden; height: 100vh; margin: 0;">
    </body>

    <script type="text/javascript">
    const consoleLog = (type, log) => window.ReactNativeWebView.postMessage(JSON.stringify({'type': 'Console', 'data': {'type': type, 'log': log}}));
    console = {
        log: (log) => consoleLog('log', log),
        debug: (log) => consoleLog('debug', log),
        info: (log) => consoleLog('info', log),
        warn: (log) => consoleLog('warn', log),
        error: (log) => consoleLog('error', log),
      };

      function onClose() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ onClose: true }));
      };

      function onDisplayCreated() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ onDisplayCreated: true }));
      };

      function onResponseCreated() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ onResponseCreated: true }));
      };

      // Fires once the finished response has been accepted by the backend — the surveys library
      // gates this on \`isResponseSendingFinished\`, and \`getSetIsResponseSendingFinished\` below
      // flips that initial state to false.
      function onFinished() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ onFinished: true }));
      };

      function getSetIsResponseSendingFinished() { /* noop — presence flips initial state to false so loading spinner renders until ResponseQueue resolves */ };
      function getSetIsError() { /* noop */ };

      function loadSurvey() {
        const options = ${optionsJson};
        const surveyProps = {
          ...options,
          onDisplayCreated,
          onResponseCreated,
          onFinished,
          onClose,
          getSetIsResponseSendingFinished,
          getSetIsError,
        };

        window.formbricksSurveys.renderSurvey(surveyProps);
      }

      const script = document.createElement("script");
      script.src = ${JSON.stringify(surveyScriptUrl)};
      script.async = true;
      script.onload = () => loadSurvey();
      script.onerror = (error) => {
        console.error("Failed to load Formbricks Surveys library:", error);
      };

      document.head.appendChild(script);
    </script>
  </html>
  `;
};
