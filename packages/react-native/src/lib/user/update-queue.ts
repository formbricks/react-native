/* eslint-disable @typescript-eslint/no-empty-function -- required for singleton pattern */
import { RNConfig } from "@/lib/common/config";
import { Logger } from "@/lib/common/logger";
import { sendUpdates } from "@/lib/user/update";
import type { TAttributes, TUpdates } from "@/types/config";

const logger = Logger.getInstance();

export class UpdateQueue {
  private static instance: UpdateQueue | null = null;
  private updates: TUpdates | null = null;
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_DELAY = 500;

  private constructor() {}

  public static getInstance(): UpdateQueue {
    UpdateQueue.instance ??= new UpdateQueue();

    return UpdateQueue.instance;
  }

  public updateUserId(userId: string): void {
    if (!this.updates) {
      this.updates = {
        userId,
        attributes: {},
      };
    } else {
      this.updates = {
        ...this.updates,
        userId,
      };
    }
  }

  public async updateAttributes(attributes: TAttributes): Promise<void> {
    const config = await RNConfig.getInstance();
    // Get userId from updates first, then fallback to config
    const userId = this.updates?.userId ?? config.get().user.data.userId ?? "";

    if (!this.updates) {
      this.updates = {
        userId,
        attributes,
      };
    } else {
      this.updates = {
        ...this.updates,
        userId,
        attributes: { ...this.updates.attributes, ...attributes },
      };
    }
  }

  public getUpdates(): TUpdates | null {
    return this.updates;
  }

  public clearUpdates(): void {
    this.updates = null;
  }

  public isEmpty(): boolean {
    return !this.updates;
  }

  private handleLanguageWithoutUserId(
    currentUpdates: Partial<TUpdates> & { attributes?: TAttributes },
    config: RNConfig
  ): Partial<TUpdates> & { attributes?: TAttributes } {
    if (!currentUpdates.attributes?.language) {
      return currentUpdates;
    }

    // Update language in local config
    config.update({
      ...config.get(),
      user: {
        ...config.get().user,
        data: {
          ...config.get().user.data,
          language: currentUpdates.attributes.language,
        },
      },
    });

    logger.debug("Updated language successfully");

    // Remove language from attributes
    const { language: _, ...remainingAttributes } = currentUpdates.attributes;
    return {
      ...currentUpdates,
      attributes: remainingAttributes,
    };
  }

  private validateAttributesWithUserId(
    currentUpdates: Partial<TUpdates> & { attributes?: TAttributes },
    effectiveUserId: string | null | undefined
  ): void {
    const hasAttributes =
      Object.keys(currentUpdates.attributes ?? {}).length > 0;

    if (hasAttributes && !effectiveUserId) {
      const errorMessage =
        "Formbricks can't set attributes without a userId! Please set a userId first with the setUserId function";
      logger.error(errorMessage);
      this.clearUpdates();
      throw new Error(errorMessage);
    }
  }

  private async sendUpdatesIfNeeded(
    effectiveUserId: string | null | undefined,
    currentUpdates: Partial<TUpdates> & { attributes?: TAttributes }
  ): Promise<void> {
    if (!effectiveUserId) {
      return;
    }

    const result = await sendUpdates({
      updates: {
        userId: effectiveUserId,
        attributes: currentUpdates.attributes ?? {},
      },
    });

    if (result.ok) {
      logger.debug("Updates sent successfully");
    } else {
      const err = result.error as {
        status?: number;
        code?: string;
        message?: string;
      };
      logger.error(
        `Failed to send updates: ${err?.message ?? "unknown error"}`
      );
    }
  }

  public async processUpdates(): Promise<void> {
    if (!this.updates) {
      return;
    }

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    return new Promise((resolve, reject) => {
      const handler = async (): Promise<void> => {
        try {
          let currentUpdates = { ...this.updates };
          const config = await RNConfig.getInstance();

          if (Object.keys(currentUpdates).length === 0) {
            this.clearUpdates();
            resolve();
            return;
          }

          const effectiveUserId =
            currentUpdates.userId ?? config.get().user.data.userId;

          // Handle language updates without userId
          if (!effectiveUserId) {
            currentUpdates = this.handleLanguageWithoutUserId(
              currentUpdates,
              config
            );
          }

          // Validate attributes require userId
          this.validateAttributesWithUserId(currentUpdates, effectiveUserId);

          // Send updates if we have a userId
          await this.sendUpdatesIfNeeded(effectiveUserId, currentUpdates);

          this.clearUpdates();
          resolve();
        } catch (error: unknown) {
          logger.error(
            `Failed to process updates: ${error instanceof Error ? error.message : "Unknown error"}`
          );
          reject(error as Error);
        }
      };

      this.debounceTimeout = setTimeout(
        () => void handler(),
        this.DEBOUNCE_DELAY
      );
    });
  }
}
