import type React from "react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { SurveyWebView } from "@/components/survey-web-view";
import { Logger } from "@/lib/common/logger";
import { setup } from "@/lib/common/setup";
import { SurveyStore } from "@/lib/survey/store";

type FormbricksProps = { appUrl: string } & (
  | {
      workspaceId: string;
      environmentId?: never;
    }
  | {
      /** @deprecated Use `workspaceId` instead. Still works as a backward-compatible alias. */
      environmentId: string;
      workspaceId?: never;
    }
);

const surveyStore = SurveyStore.getInstance();
const logger = Logger.getInstance();

export function Formbricks({
  appUrl,
  environmentId,
  workspaceId,
}: FormbricksProps): React.JSX.Element | null {
  // initializes sdk
  useEffect(() => {
    const setupFormbricks = async (): Promise<void> => {
      try {
        await setup({
          workspaceId,
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
  }, [environmentId, workspaceId, appUrl]);

  const subscribe = useCallback((callback: () => void) => {
    const unsubscribe = surveyStore.subscribe(callback);
    return unsubscribe;
  }, []);

  const getSnapshot = useCallback(() => surveyStore.getSurvey(), []);
  const survey = useSyncExternalStore(subscribe, getSnapshot);

  // Wrap in View with pointerEvents="box-none" to fix Android touch event handling.
  return survey ? (
    // Fills the parent: a no-overlay survey renders in the host's view tree (not a Modal) and
    // positions itself against this wrapper, which would otherwise be 0x0.
    <View pointerEvents="box-none" style={styles.layer}>
      <SurveyWebView survey={survey} />
    </View>
  ) : null;
}

const styles = StyleSheet.create({
  // Android draws elevated siblings (Buttons, cards, tab bars) above views without elevation,
  // whatever their order in the tree, so a no-overlay card would sit under them. The layer is
  // transparent, so the elevation casts no shadow. `zIndex` keeps it last on iOS too.
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
  },
});
