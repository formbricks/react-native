/* eslint-disable no-console -- Required for error logging */
import { AsyncStorage } from "@/lib/common/storage";
import { wrapThrowsAsync } from "@/lib/common/utils";
import type {
  TConfig,
  TConfigUpdateInput,
  TLegacyConfig,
} from "@/types/config";
import { err, ok, type Result } from "@/types/error";

export const RN_ASYNC_STORAGE_KEY = "formbricks-react-native";

/**
 * Migrate AsyncStorage config from the pre-workspace rename shape:
 *  - `environmentId` → `workspaceId`
 *  - `environment`   → `workspace`
 *  - `environment.data.project` (or legacy `workspace`) → `workspace.data.settings`
 */
const migrateLegacyConfig = (parsed: TLegacyConfig): TConfig => {
  // Already in the new shape
  if (parsed.workspace && parsed.workspaceId) {
    return parsed;
  }

  const legacyEnvironment = parsed.environment;
  const migratedWorkspace = legacyEnvironment
    ? (() => {
        const envData = legacyEnvironment.data;
        const settings = envData.settings ?? envData.project;
        return {
          expiresAt: legacyEnvironment.expiresAt,
          data: {
            surveys: envData.surveys,
            actionClasses: envData.actionClasses,
            settings: settings as TConfig["workspace"]["data"]["settings"],
          },
        } as TConfig["workspace"];
      })()
    : undefined;

  const { environmentId, environment, ...rest } = parsed;

  return {
    ...(rest as unknown as TConfig),
    workspaceId:
      (rest as unknown as TConfig).workspaceId ?? (environmentId as string),
    ...(migratedWorkspace ? { workspace: migratedWorkspace } : {}),
  } as TConfig;
};

export class RNConfig {
  private static instance: RNConfig | null = null;

  private config: TConfig | null = null;

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- singleton constructor
  private constructor() {}

  public async init(): Promise<void> {
    try {
      const localConfig = await this.loadFromStorage();
      if (localConfig.ok) {
        this.config = localConfig.data;
      }
    } catch (e: unknown) {
      console.error("Error loading config from storage", e);
    }
  }

  public static async getInstance(): Promise<RNConfig> {
    RNConfig.instance ??= new RNConfig();
    await RNConfig.instance.init();
    return RNConfig.instance;
  }

  public update(newConfig: TConfigUpdateInput): void {
    this.config = {
      ...this.config,
      ...newConfig,
      status: {
        value: newConfig.status?.value ?? "success",
        expiresAt: newConfig.status?.expiresAt ?? null,
      },
    };

    void this.saveToStorage();
  }

  public get(): TConfig {
    if (!this.config) {
      throw new Error(
        "config is null, maybe the init function was not called?",
      );
    }
    return this.config;
  }

  public async loadFromStorage(): Promise<Result<TConfig>> {
    try {
      const savedConfig = await AsyncStorage.getItem(RN_ASYNC_STORAGE_KEY);
      if (savedConfig) {
        const parsedConfig = migrateLegacyConfig(
          JSON.parse(savedConfig) as TLegacyConfig,
        );

        // check if the config has expired
        if (
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- need to check if expiresAt is set
          parsedConfig.workspace.expiresAt &&
          new Date(parsedConfig.workspace.expiresAt) <= new Date()
        ) {
          return err(new Error("Config in local storage has expired"));
        }

        return ok(parsedConfig);
      }
    } catch {
      return err(new Error("No or invalid config in local storage"));
    }

    return err(new Error("No or invalid config in local storage"));
  }

  private async saveToStorage(): Promise<Result<void>> {
    return wrapThrowsAsync(async () => {
      await AsyncStorage.setItem(
        RN_ASYNC_STORAGE_KEY,
        JSON.stringify(this.config),
      );
    })();
  }

  // reset the config
  public async resetConfig(): Promise<Result<void>> {
    this.config = null;

    return wrapThrowsAsync(async () => {
      await AsyncStorage.removeItem(RN_ASYNC_STORAGE_KEY);
    })();
  }
}
