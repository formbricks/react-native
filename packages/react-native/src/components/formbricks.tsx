import { SurveyWebView } from "@/components/survey-web-view";
import { Logger } from "@/lib/common/logger";
import { setup } from "@/lib/common/setup";
import { SurveyStore } from "@/lib/survey/store";
import React, { useCallback, useEffect, useSyncExternalStore } from "react";
import { View } from "react-native";

interface FormbricksProps {
  appUrl: string;
  environmentId: string;
}

const surveyStore = SurveyStore.getInstance();
const logger = Logger.getInstance();

export function Formbricks({ appUrl, environmentId }: FormbricksProps): React.JSX.Element | null {
  // initializes sdk
  useEffect(() => {
    const setupFormbricks = async (): Promise<void> => {
      try {
        await setup({
          environmentId,
          appUrl,
        });
      } catch {
        logger.debug("Initialization failed");
      }
    };

    setupFormbricks().catch(() => {
      logger.debug("Initialization error");
    });
  }, [environmentId, appUrl]);

  const subscribe = useCallback((callback: () => void) => {
    const unsubscribe = surveyStore.subscribe(callback);
    return unsubscribe;
  }, []);

  const getSnapshot = useCallback(() => surveyStore.getSurvey(), []);
  const survey = useSyncExternalStore(subscribe, getSnapshot);

  // Wrap in View with pointerEvents="box-none" to allow touches to pass through
  // on Android when the survey is not visible or in transparent areas.
  // Issue reference: https://github.com/formbricks/react-native/issues/23
  return (
    <View pointerEvents="box-none">
      {survey ? <SurveyWebView survey={survey} /> : null}
    </View>
  );
}
