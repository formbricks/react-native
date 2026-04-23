import { RN_ASYNC_STORAGE_KEY, RNConfig } from "@/lib/common/config";
import {
  addCleanupEventListeners,
  addEventListeners,
  removeAllEventListeners,
} from "@/lib/common/event-listeners";
import { Logger } from "@/lib/common/logger";
import { AsyncStorage } from "@/lib/common/storage";
import {
  filterSurveys,
  isNowExpired,
  wrapThrowsAsync,
} from "@/lib/common/utils";
import { DEFAULT_USER_STATE_NO_USER_ID } from "@/lib/user/state";
import { sendUpdatesToBackend } from "@/lib/user/update";
import { fetchWorkspaceState } from "@/lib/workspace/state";
import type {
  TConfig,
  TConfigInput,
  TUserState,
  TWorkspaceState,
} from "@/types/config";
import {
  err,
  type MissingFieldError,
  type MissingPersonError,
  type NetworkError,
  type NotSetupError,
  ok,
  okVoid,
  type Result,
} from "@/types/error";

let isSetup = false;

export const setIsSetup = (state: boolean): void => {
  isSetup = state;
};

// Helper: Handle missing field error
function handleMissingField(field: string): Result<void, MissingFieldError> {
  const logger = Logger.getInstance();
  logger.debug(`No ${field} provided`);
  return err({
    code: "missing_field",
    field,
  } as const);
}

// Helper: Sync workspace state if expired
async function syncWorkspaceStateIfExpired(
  configInput: { appUrl: string; workspaceId: string },
  logger: ReturnType<typeof Logger.getInstance>,
  existingConfig?: TConfig,
): Promise<Result<TWorkspaceState, NetworkError>> {
  if (existingConfig && !isNowExpired(existingConfig.workspace.expiresAt)) {
    return ok(existingConfig.workspace);
  }

  logger.debug("Workspace state expired. Syncing.");

  const workspaceResponse = await fetchWorkspaceState({
    appUrl: configInput.appUrl,
    workspaceId: configInput.workspaceId,
  });

  if (workspaceResponse.ok) {
    return ok(workspaceResponse.data);
  }

  logger.error(
    `Error fetching workspace state: ${workspaceResponse.error.code} - ${workspaceResponse.error.responseMessage ?? ""}`,
  );

  return err({
    code: "network_error",
    message: "Error fetching workspace state",
    status: 500,
    url: new URL(
      `${configInput.appUrl}/api/v1/client/${configInput.workspaceId}/environment`,
    ),
    responseMessage: workspaceResponse.error.message,
  });
}

// Helper: Sync user state if expired
async function syncUserStateIfExpired(
  configInput: { appUrl: string; workspaceId: string },
  logger: ReturnType<typeof Logger.getInstance>,
  existingConfig?: TConfig,
): Promise<Result<TUserState, NetworkError>> {
  const userState = existingConfig?.user;
  if (userState && !userState.expiresAt) {
    return ok(userState);
  }

  if (userState?.expiresAt && !isNowExpired(userState.expiresAt)) {
    return ok(userState);
  }

  logger.debug("Person state expired. Syncing.");

  if (userState?.data.userId) {
    const updatesResponse = await sendUpdatesToBackend({
      appUrl: configInput.appUrl,
      workspaceId: configInput.workspaceId,
      updates: {
        userId: userState.data.userId,
      },
    });
    if (updatesResponse.ok) {
      return ok(updatesResponse.data.state);
    }

    logger.error(
      `Error updating user state: ${updatesResponse.error.code} - ${updatesResponse.error.responseMessage ?? ""}`,
    );
    return err({
      code: "network_error",
      message: "Error updating user state",
      status: 500,
      url: new URL(
        `${configInput.appUrl}/api/v1/client/${configInput.workspaceId}/update/contacts/${userState.data.userId}`,
      ),
      responseMessage: "Unknown error",
    } as const);
  }

  return ok(DEFAULT_USER_STATE_NO_USER_ID);
}

// Helper: Update app config with synced states
const updateAppConfigWithSyncedStates = (
  appConfig: RNConfig,
  workspace: TWorkspaceState,
  userState: TUserState,
  logger: ReturnType<typeof Logger.getInstance>,
  existingConfig?: TConfig,
): void => {
  if (!existingConfig) {
    return;
  }

  const filteredSurveys = filterSurveys(workspace, userState);

  appConfig.update({
    ...existingConfig,
    workspace,
    user: userState,
    filteredSurveys,
  });

  const surveyNames = filteredSurveys.map((s) => s.name);
  logger.debug(
    `Fetched ${surveyNames.length.toString()} surveys during sync: ${surveyNames.join(", ")}`,
  );
};

// Helper: Create new config and sync
const createNewConfigAndSync = async (
  appConfig: RNConfig,
  configInput: { appUrl: string; workspaceId: string },
  logger: ReturnType<typeof Logger.getInstance>,
): Promise<void> => {
  logger.debug(
    "No valid configuration found. Resetting config and creating new one.",
  );

  await appConfig.resetConfig();
  logger.debug("Syncing.");

  try {
    const workspaceResponse = await fetchWorkspaceState({
      appUrl: configInput.appUrl,
      workspaceId: configInput.workspaceId,
    });

    if (workspaceResponse.ok) {
      const personState = DEFAULT_USER_STATE_NO_USER_ID;
      const workspace = workspaceResponse.data;
      const filteredSurveys = filterSurveys(workspace, personState);
      appConfig.update({
        appUrl: configInput.appUrl,
        workspaceId: configInput.workspaceId,
        user: personState,
        workspace,
        filteredSurveys,
      });
      return;
    }

    await handleErrorOnFirstSetup({
      code: workspaceResponse.error.code,
      responseMessage:
        workspaceResponse.error.responseMessage ??
        workspaceResponse.error.message,
    });
  } catch (e: unknown) {
    const setupError = normalizeSetupError(e);
    await handleErrorOnFirstSetup({
      code: setupError.code ?? "network_error",
      responseMessage:
        setupError.responseMessage ?? setupError.message ?? "Unknown error",
    });
  }
};

// Helper: Should sync config
const shouldSyncConfig = (
  existingConfig: TConfig | undefined,
  configInput: { appUrl: string; workspaceId: string },
): boolean => {
  return Boolean(
    existingConfig?.workspace &&
      existingConfig.workspaceId === configInput.workspaceId &&
      existingConfig.appUrl === configInput.appUrl,
  );
};

// Helper: Should return early for error state
const shouldReturnEarlyForErrorState = (
  existingConfig: TConfig | undefined,
  logger: ReturnType<typeof Logger.getInstance>,
): boolean => {
  if (existingConfig?.status.value === "error") {
    logger.debug("Formbricks was set to an error state.");
    const expiresAt = existingConfig.status.expiresAt;
    if (expiresAt && isNowExpired(expiresAt)) {
      logger.debug("Error state is not expired, skipping setup");
      return true;
    }
    logger.debug("Error state is expired. Continue with setup.");
  }

  return false;
};

// Helper: Add event listeners and finalize setup
const finalizeSetup = (): void => {
  const logger = Logger.getInstance();
  logger.debug("Adding event listeners");
  addEventListeners();
  addCleanupEventListeners();
  setIsSetup(true);
  logger.debug("Set up complete");
};

// Helper: Load existing config
const loadExistingConfig = (
  appConfig: RNConfig,
  logger: ReturnType<typeof Logger.getInstance>,
): TConfig | undefined => {
  let existingConfig: TConfig | undefined;
  try {
    existingConfig = appConfig.get();
    logger.debug("Found existing configuration.");
  } catch {
    logger.debug("No existing configuration found.");
  }
  return existingConfig;
};

export const setup = async (
  configInput: TConfigInput,
): Promise<
  Result<void, MissingFieldError | NetworkError | MissingPersonError>
> => {
  const appConfig = await RNConfig.getInstance();

  const logger = Logger.getInstance();

  if (isSetup) {
    logger.debug("Already set up, skipping setup.");
    return okVoid();
  }

  const existingConfig = loadExistingConfig(appConfig, logger);
  if (shouldReturnEarlyForErrorState(existingConfig, logger)) {
    return okVoid();
  }

  logger.debug("Start setup");

  // Resolve effective ID: prefer workspaceId, fall back to environmentId
  const effectiveId = configInput.workspaceId ?? configInput.environmentId;

  if (!effectiveId) {
    return handleMissingField("workspaceId");
  }

  if (configInput.environmentId && !configInput.workspaceId) {
    logger.debug(
      "environmentId is deprecated and will be removed in a future version. Please use workspaceId instead.",
    );
  }

  if (!configInput.appUrl) {
    return handleMissingField("appUrl");
  }

  const resolvedInput = {
    appUrl: configInput.appUrl,
    workspaceId: effectiveId,
  };

  if (shouldSyncConfig(existingConfig, resolvedInput)) {
    logger.debug("Configuration fits setup parameters.");
    let workspace: TWorkspaceState | undefined;
    let userState: TUserState | undefined;

    try {
      const workspaceResult = await syncWorkspaceStateIfExpired(
        resolvedInput,
        logger,
        existingConfig,
      );

      if (workspaceResult.ok) {
        workspace = workspaceResult.data;
      } else {
        return err(workspaceResult.error);
      }

      const userStateResult = await syncUserStateIfExpired(
        resolvedInput,
        logger,
        existingConfig,
      );

      if (userStateResult.ok) {
        userState = userStateResult.data;
      } else {
        return err(userStateResult.error);
      }

      updateAppConfigWithSyncedStates(
        appConfig,
        workspace,
        userState,
        logger,
        existingConfig,
      );
    } catch {
      logger.debug("Error during sync. Please try again.");
    }
  } else {
    await createNewConfigAndSync(appConfig, resolvedInput, logger);
  }
  finalizeSetup();
  return okVoid();
};

export const checkSetup = (): Result<void, NotSetupError> => {
  const logger = Logger.getInstance();
  logger.debug("Check if set up");

  if (!isSetup) {
    return err({
      code: "not_setup",
      message: "Formbricks is not set up. Call setup() first.",
    });
  }

  return okVoid();
};
export const tearDown = async (): Promise<void> => {
  const logger = Logger.getInstance();
  const appConfig = await RNConfig.getInstance();

  logger.debug("Setting user state to default");

  const { workspace } = appConfig.get();

  const filteredSurveys = filterSurveys(
    workspace,
    DEFAULT_USER_STATE_NO_USER_ID,
  );

  // clear the user state and set it to the default value
  appConfig.update({
    ...appConfig.get(),
    user: DEFAULT_USER_STATE_NO_USER_ID,
    filteredSurveys,
  });

  removeAllEventListeners();
};

export const handleErrorOnFirstSetup = async (e: {
  code: string;
  responseMessage: string;
}): Promise<never> => {
  const logger = Logger.getInstance();

  if (e.code === "forbidden") {
    logger.error(`Authorization error: ${e.responseMessage}`);
  } else {
    logger.error(
      `Error during first setup: ${e.code} - ${e.responseMessage}. Please try again later.`,
    );
  }

  // put formbricks in error state (by creating a new config) and throw error
  const initialErrorConfig: Partial<TConfig> = {
    status: {
      value: "error",
      expiresAt: new Date(Date.now() + 10 * 60000), // 10 minutes in the future
    },
  };

  await wrapThrowsAsync(async () => {
    await AsyncStorage.setItem(
      RN_ASYNC_STORAGE_KEY,
      JSON.stringify(initialErrorConfig),
    );
  })();

  throw new Error("Could not set up formbricks");
};

const normalizeSetupError = (
  error: unknown,
): Partial<{
  code: string;
  responseMessage: string;
  message: string;
}> => {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const candidate = error as Record<string, unknown>;

  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    responseMessage:
      typeof candidate.responseMessage === "string"
        ? candidate.responseMessage
        : undefined,
    message:
      typeof candidate.message === "string" ? candidate.message : undefined,
  };
};
