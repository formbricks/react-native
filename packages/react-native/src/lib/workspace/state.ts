/* eslint-disable no-console -- logging required for error logging */
import { ApiClient } from "@/lib/common/api";
import { RNConfig } from "@/lib/common/config";
import { Logger } from "@/lib/common/logger";
import { filterSurveys } from "@/lib/common/utils";
import type { TWorkspaceState } from "@/types/config";
import { type ApiErrorResponse, err, ok, type Result } from "@/types/error";

let workspaceSyncIntervalId: number | null = null;

/**
 * Fetch the workspace state from the backend
 * @param appUrl - The app URL
 * @param workspaceId - The workspace ID
 * @returns The workspace state
 * @throws NetworkError
 */
export const fetchWorkspaceState = async ({
  appUrl,
  workspaceId,
}: {
  appUrl: string;
  workspaceId: string;
}): Promise<Result<TWorkspaceState, ApiErrorResponse>> => {
  const url = `${appUrl}/api/v1/client/${workspaceId}/environment`;
  const api = new ApiClient({ appUrl, workspaceId, isDebug: false });

  try {
    const response = await api.getWorkspaceState();

    if (!response.ok) {
      return err({
        code: response.error.code,
        status: response.error.status,
        message: "Error syncing with backend",
        url: new URL(url),
        responseMessage: response.error.message,
      });
    }

    // The server responds with `data.workspace` (new) or `data.project` (legacy
    // backwards-compat alias) but SDK internals use `data.settings` to avoid
    // the `workspace.workspace` nesting. Map the field name here.
    const rawData = response.data as TWorkspaceState & {
      data: {
        workspace?: TWorkspaceState["data"]["settings"];
        project?: TWorkspaceState["data"]["settings"];
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- server may send `workspace` or legacy `project` instead of `settings`
    if (!rawData.data.settings) {
      if (rawData.data.workspace) {
        rawData.data.settings = rawData.data.workspace;
        delete rawData.data.workspace;
      } else if (rawData.data.project) {
        rawData.data.settings = rawData.data.project;
        delete rawData.data.project;
      }
    }

    return ok(rawData);
  } catch (e: unknown) {
    const errorTyped = e as ApiErrorResponse;
    return err({
      code: "network_error",
      message: errorTyped.message,
      status: 500,
      url: new URL(url),
      responseMessage: errorTyped.responseMessage ?? "Network error",
    });
  }
};

/**
 * Add a listener to check if the workspace state has expired with a certain interval
 */
export const addWorkspaceStateExpiryCheckListener =
  async (): Promise<void> => {
    const appConfig = await RNConfig.getInstance();
    const logger = Logger.getInstance();

    const updateInterval = 1000 * 60; // every minute

    if (workspaceSyncIntervalId === null) {
      const intervalHandler = async (): Promise<void> => {
        const expiresAt = appConfig.get().workspace.expiresAt;

        try {
          // check if the workspace state has not expired yet
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- expiresAt is checked for null
          if (expiresAt && new Date(expiresAt) >= new Date()) {
            return;
          }

          logger.debug("Workspace state has expired. Starting sync.");

          const personState = appConfig.get().user;
          const workspace = await fetchWorkspaceState({
            appUrl: appConfig.get().appUrl,
            workspaceId: appConfig.get().workspaceId,
          });

          if (workspace.ok) {
            const { data: state } = workspace;
            const filteredSurveys = filterSurveys(state, personState);

            appConfig.update({
              ...appConfig.get(),
              workspace: state,
              filteredSurveys,
            });
          } else {
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- error is an ApiErrorResponse
            throw workspace.error;
          }
        } catch (e) {
          console.error(`Error during expiry check: `, e);
          logger.debug("Extending config and try again later.");
          const existingConfig = appConfig.get();
          appConfig.update({
            ...existingConfig,
            workspace: {
              ...existingConfig.workspace,
              expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
            },
          });
        }
      };

      workspaceSyncIntervalId = setInterval(
        () => void intervalHandler(),
        updateInterval,
      ) as unknown as number;
    }
  };

export const clearWorkspaceStateExpiryCheckListener = (): void => {
  if (workspaceSyncIntervalId) {
    clearInterval(workspaceSyncIntervalId);
    workspaceSyncIntervalId = null;
  }
};
