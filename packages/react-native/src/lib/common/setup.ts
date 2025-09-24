import { RNConfig, RN_ASYNC_STORAGE_KEY } from "@/lib/common/config";
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
import { fetchEnvironmentState } from "@/lib/environment/state";
import { DEFAULT_USER_STATE_NO_USER_ID } from "@/lib/user/state";
import { sendUpdatesToBackend } from "@/lib/user/update";
import {
  type TConfig,
  type TConfigInput,
  type TEnvironmentState,
  type TUserState,
} from "@/types/config";
import {
  type MissingFieldError,
  type MissingPersonError,
  type NetworkError,
  type NotSetupError,
  type Result,
  err,
  ok,
  okVoid,
} from "@/types/error";

let isSetup = false;

export const setIsSetup = (state: boolean): void => {
  isSetup = state;
};

export const migrateUserStateAddContactId = async (): Promise<{
  changed: boolean;
}> => {
  const existingConfigString = await AsyncStorage.getItem(RN_ASYNC_STORAGE_KEY);

  if (existingConfigString) {
    const existingConfig = JSON.parse(existingConfigString) as Partial<TConfig>;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- data could be undefined
    if (existingConfig.user?.data?.contactId) {
      return { changed: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- data could be undefined
    if (
      !existingConfig.user?.data?.contactId &&
      existingConfig.user?.data?.userId
    ) {
      return { changed: true };
    }
  }

  return { changed: false };
};

// Helper: Handle missing field error
function handleMissingField(field: string) {
  const logger = Logger.getInstance();
  logger.debug(`No ${field} provided`);
  return err({
    code: "missing_field",
    field,
  } as const);
}

// Helper: Sync environment state if expired
async function syncEnvironmentStateIfExpired(
  configInput: TConfigInput,
  logger: ReturnType<typeof Logger.getInstance>,
  existingConfig?: TConfig
): Promise<Result<TEnvironmentState, NetworkError>> {
  if (existingConfig && !isNowExpired(existingConfig.environment.expiresAt)) {
    return ok(existingConfig.environment);
  }

  logger.debug("Environment state expired. Syncing.");

  const environmentStateResponse = await fetchEnvironmentState({
    appUrl: configInput.appUrl,
    environmentId: configInput.environmentId,
  });

  if (environmentStateResponse.ok) {
    return ok(environmentStateResponse.data);
  } else {
    logger.error(
      `Error fetching environment state: ${environmentStateResponse.error.code} - ${environmentStateResponse.error.responseMessage ?? ""}`
    );

    return err({
      code: "network_error",
      message: "Error fetching environment state",
      status: 500,
      url: new URL(
        `${configInput.appUrl}/api/v1/client/${configInput.environmentId}/environment`
      ),
      responseMessage: environmentStateResponse.error.message,
    });
  }
}

// Helper: Sync user state if expired
async function syncUserStateIfExpired(
  configInput: TConfigInput,
  logger: ReturnType<typeof Logger.getInstance>,
  existingConfig?: TConfig
): Promise<Result<TUserState, NetworkError>> {
  const userState = existingConfig?.user;
  if (userState && !userState.expiresAt) {
    return ok(userState);
  }

  if (userState?.expiresAt && !isNowExpired(userState.expiresAt)) {
    return ok(userState);
  }

  logger.debug("Person state expired. Syncing.");

  if (userState?.data?.userId) {
    const updatesResponse = await sendUpdatesToBackend({
      appUrl: configInput.appUrl,
      environmentId: configInput.environmentId,
      updates: {
        userId: userState.data.userId,
      },
    });
    if (updatesResponse.ok) {
      return ok(updatesResponse.data.state);
    } else {
      logger.error(
        `Error updating user state: ${updatesResponse.error.code} - ${updatesResponse.error.responseMessage ?? ""}`
      );
      return err({
        code: "network_error",
        message: "Error updating user state",
        status: 500,
        url: new URL(
          `${configInput.appUrl}/api/v1/client/${configInput.environmentId}/update/contacts/${userState.data.userId}`
        ),
        responseMessage: "Unknown error",
      } as const);
    }
  } else {
    return ok(DEFAULT_USER_STATE_NO_USER_ID);
  }
}

// Helper: Update app config with synced states
const updateAppConfigWithSyncedStates = (
  appConfig: RNConfig,
  environmentState: TEnvironmentState,
  userState: TUserState,
  logger: ReturnType<typeof Logger.getInstance>,
  existingConfig?: TConfig
): void => {
  if (!existingConfig) {
    return;
  }

  const filteredSurveys = filterSurveys(environmentState, userState);

  appConfig.update({
    ...existingConfig,
    environment: environmentState,
    user: userState,
    filteredSurveys,
  });

  const surveyNames = filteredSurveys.map((s) => s.name);
  logger.debug(
    `Fetched ${surveyNames.length.toString()} surveys during sync: ${surveyNames.join(", ")}`
  );
};

// Helper: Create new config and sync
const createNewConfigAndSync = async (
  appConfig: RNConfig,
  configInput: TConfigInput,
  logger: ReturnType<typeof Logger.getInstance>
): Promise<void> => {
  logger.debug(
    "No valid configuration found. Resetting config and creating new one."
  );

  await appConfig.resetConfig();
  logger.debug("Syncing.");

  try {
    const environmentStateResponse = await fetchEnvironmentState({
      appUrl: configInput.appUrl,
      environmentId: configInput.environmentId,
    });
    if (!environmentStateResponse.ok) {
      throw environmentStateResponse.error;
    }
    const personState = DEFAULT_USER_STATE_NO_USER_ID;
    const environmentState = environmentStateResponse.data;
    const filteredSurveys = filterSurveys(environmentState, personState);
    appConfig.update({
      appUrl: configInput.appUrl,
      environmentId: configInput.environmentId,
      user: personState,
      environment: environmentState,
      filteredSurveys,
    });
  } catch (e) {
    await handleErrorOnFirstSetup(
      e as { code: string; responseMessage: string }
    );
  }
};

// Helper: Should sync config
const shouldSyncConfig = (
  existingConfig: TConfig | undefined,
  configInput: TConfigInput
): boolean => {
  return Boolean(
    existingConfig?.environment &&
    existingConfig.environmentId === configInput.environmentId &&
    existingConfig.appUrl === configInput.appUrl
  );
};

// Helper: Should return early for error state
const shouldReturnEarlyForErrorState = (
  existingConfig: TConfig | undefined,
  logger: ReturnType<typeof Logger.getInstance>
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
const loadExistingConfig = async (
  appConfig: RNConfig,
  logger: ReturnType<typeof Logger.getInstance>
): Promise<TConfig | undefined> => {
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
  configInput: TConfigInput
): Promise<
  Result<void, MissingFieldError | NetworkError | MissingPersonError>
> => {
  let appConfig = await RNConfig.getInstance();

  const logger = Logger.getInstance();
  const { changed } = await migrateUserStateAddContactId();

  if (changed) {
    await appConfig.resetConfig();
    appConfig = await RNConfig.getInstance();
  }

  if (isSetup) {
    logger.debug("Already set up, skipping setup.");
    return okVoid();
  }

  const existingConfig = await loadExistingConfig(appConfig, logger);
  if (shouldReturnEarlyForErrorState(existingConfig, logger)) {
    return okVoid();
  }

  logger.debug("Start setup");

  if (!configInput.environmentId) {
    return handleMissingField("environmentId");
  }

  if (!configInput.appUrl) {
    return handleMissingField("appUrl");
  }

  if (shouldSyncConfig(existingConfig, configInput)) {
    logger.debug("Configuration fits setup parameters.");
    let environmentState: TEnvironmentState | undefined;
    let userState: TUserState | undefined;

    try {
      const environmentStateResult = await syncEnvironmentStateIfExpired(
        configInput,
        logger,
        existingConfig
      );

      if (environmentStateResult.ok) {
        environmentState = environmentStateResult.data;
      } else {
        return err(environmentStateResult.error);
      }

      const userStateResult = await syncUserStateIfExpired(
        configInput,
        logger,
        existingConfig
      );

      if (userStateResult.ok) {
        userState = userStateResult.data;
      } else {
        return err(userStateResult.error);
      }

      updateAppConfigWithSyncedStates(
        appConfig,
        environmentState,
        userState,
        logger,
        existingConfig
      );
    } catch {
      logger.debug("Error during sync. Please try again.");
    }
  } else {
    await createNewConfigAndSync(appConfig, configInput, logger);
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

// eslint-disable-next-line @typescript-eslint/require-await -- disabled for now
export const tearDown = async (): Promise<void> => {
  const logger = Logger.getInstance();
  const appConfig = await RNConfig.getInstance();

  logger.debug("Setting user state to default");

  const { environment } = appConfig.get();

  const filteredSurveys = filterSurveys(
    environment,
    DEFAULT_USER_STATE_NO_USER_ID
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
      `Error during first setup: ${e.code} - ${e.responseMessage}. Please try again later.`
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
      JSON.stringify(initialErrorConfig)
    );
  })();

  throw new Error("Could not set up formbricks");
};
