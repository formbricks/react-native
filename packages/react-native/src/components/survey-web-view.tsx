/* eslint-disable no-console -- debugging*/
import { RNConfig } from "@/lib/common/config";
import { Logger } from "@/lib/common/logger";
import { filterSurveys, getLanguageCode, getStyling } from "@/lib/common/utils";
import { SurveyStore } from "@/lib/survey/store";
import { type TUserState, ZJsRNWebViewOnMessageData } from "@/types/config";
import type { TSurvey, SurveyContainerProps } from "@/types/survey";
import React, { type JSX, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, View, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

const logger = Logger.getInstance();
logger.configure({ logLevel: "debug" });


const surveyStore = SurveyStore.getInstance();

interface SurveyWebViewProps {
  readonly survey: TSurvey;
}

export function SurveyWebView(
  props: SurveyWebViewProps
): JSX.Element | undefined {
  const webViewRef = useRef(null);
  const [isSurveyRunning, setIsSurveyRunning] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [appConfig, setAppConfig] = useState<RNConfig | null>(null);
  const [languageCode, setLanguageCode] = useState("default");

  useEffect(() => {
    const fetchConfig = async () => {
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
          `Survey "${props.survey.name}" is not available in specified language.`
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

    if (props.survey.delay) {
      logger.debug(
        `Delaying survey "${props.survey.name}" by ${String(props.survey.delay)} seconds`
      );
      const timerId = setTimeout(() => {
        setShowSurvey(true);
      }, props.survey.delay * 1000);

      return () => {
        clearTimeout(timerId);
      };
    }

    setShowSurvey(true);
  }, [props.survey.delay, isSurveyRunning, props.survey.name]);

  if (!appConfig) {
    return;
  }

  const project = appConfig.get().environment.data.project;
  const styling = getStyling(project, props.survey);
  const isBrandingEnabled = project.inAppSurveyBranding;

  const onCloseSurvey = (): void => {
    const { environment: environmentState, user: personState } =
      appConfig.get();
    const filteredSurveys = filterSurveys(environmentState, personState);

    appConfig.update({
      ...appConfig.get(),
      environment: environmentState,
      user: personState,
      filteredSurveys,
    });

    surveyStore.resetSurvey();
    setShowSurvey(false);
  };

  const surveyPlacement =
    props.survey.projectOverwrites?.placement ?? project.placement;
  const clickOutside =
    props.survey.projectOverwrites?.clickOutsideClose ??
    project.clickOutsideClose;
  const overlay =
    props.survey.projectOverwrites?.overlay ?? project.overlay;

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
            originWhitelist={["*"]}
            source={{
              html: renderHtml({
                environmentId: appConfig.get().environmentId,
                contactId: appConfig.get().user.data.contactId ?? undefined,
                survey: props.survey,
                isBrandingEnabled,
                styling,
                languageCode,
                placement: surveyPlacement,
                appUrl: appConfig.get().appUrl,
                clickOutside,
                overlay,
                getSetIsResponseSendingFinished: (
                  _f: (value: boolean) => void
                ) => undefined,
                isWebEnvironment: false,
              }),
            }}
            style={styles.webView}
            contentMode="mobile"
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            scrollEnabled={false}
            mixedContentMode="always"
            allowFileAccess
            webviewDebuggingEnabled
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            onShouldStartLoadWithRequest={(event) => {
              // prevent webview from redirecting if users taps on formbricks link.
              if (event.url.startsWith("https://formbricks")) {
                return false;
              }

              return true;
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
                  console.info(
                    `[Console] ${JSON.stringify(unvalidatedMessage.data)}`
                  );
                }

                const validatedMessage =
                  ZJsRNWebViewOnMessageData.safeParse(unvalidatedMessage);
                if (!validatedMessage.success) {
                  logger.error("Error parsing message from WebView.");
                  return;
                }

                const { onDisplayCreated, onResponseCreated, onClose } =
                  validatedMessage.data;
                if (onDisplayCreated) {
                  const existingDisplays = appConfig.get().user.data.displays;
                  const newDisplay = {
                    surveyId: props.survey.id,
                    createdAt: new Date(),
                  };

                  const displays = [...existingDisplays, newDisplay];
                  const previousConfig = appConfig.get();

                  const updatedPersonState = {
                    ...previousConfig.user,
                    data: {
                      ...previousConfig.user.data,
                      displays,
                      lastDisplayAt: new Date(),
                    },
                  };

                  const filteredSurveys = filterSurveys(
                    previousConfig.environment,
                    updatedPersonState
                  );

                  appConfig.update({
                    ...previousConfig,
                    environment: previousConfig.environment,
                    user: updatedPersonState,
                    filteredSurveys,
                  });
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
                    appConfig.get().environment,
                    newPersonState
                  );

                  appConfig.update({
                    ...appConfig.get(),
                    environment: appConfig.get().environment,
                    user: newPersonState,
                    filteredSurveys,
                  });
                }
                if (onClose) {
                  onCloseSurvey();
                }
              } catch (error) {
                logger.error(
                  `Error handling WebView message: ${error as string}`
                );
              }
            }}
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

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

const renderHtml = (
  options: Partial<SurveyContainerProps> & { appUrl?: string }
): string => {
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

      function loadSurvey() {
        const options = ${JSON.stringify(options)};
        const surveyProps = {
          ...options,
          onDisplayCreated,
          onResponseCreated,
          onClose,
        };
        
        window.formbricksSurveys.renderSurvey(surveyProps);
      }

      const script = document.createElement("script");
      script.src = "${options.appUrl ?? "http://localhost:3000"}/js/surveys.umd.cjs";
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
