import { z } from "zod";
import type { TResponseUpdate } from "@/types/response";
import type { TFileUploadParams } from "@/types/storage";
import type { TActionClass } from "./action-class";
import type { TWorkspace, TWorkspaceStyling } from "./workspace";
import type { TSurvey } from "./survey";

export type TWorkspaceStateSettings = Pick<
  TWorkspace,
  | "recontactDays"
  | "clickOutsideClose"
  | "overlay"
  | "placement"
  | "inAppSurveyBranding"
> & {
  styling: TWorkspaceStyling;
};

export type TWorkspaceStateActionClass = Pick<
  TActionClass,
  "id" | "key" | "type" | "name" | "noCodeConfig"
>;

export interface TWorkspaceState {
  expiresAt: Date;
  data: {
    surveys: TSurvey[];
    actionClasses: TWorkspaceStateActionClass[];
    settings: TWorkspaceStateSettings;
  };
}

export interface TUserState {
  expiresAt: Date | null;
  data: {
    userId: string | null;
    contactId: string | null;
    segments: string[];
    displays: { surveyId: string; createdAt: Date }[];
    responses: string[];
    lastDisplayAt: Date | null;
    language?: string;
  };
}

export interface TConfig {
  workspaceId: string;
  appUrl: string;
  workspace: TWorkspaceState;
  user: TUserState;
  filteredSurveys: TSurvey[];
  status: {
    value: "success" | "error";
    expiresAt: Date | null;
  };
}

export type TConfigUpdateInput = Omit<TConfig, "status"> & {
  status?: {
    value: "success" | "error";
    expiresAt: Date | null;
  };
};

export type TAttributes = Record<string, string | number>;

export interface TConfigInput {
  /** @deprecated Use `workspaceId` instead. Still works as a backward-compatible alias. */
  environmentId?: string;
  workspaceId?: string;
  appUrl: string;
}

/**
 * Legacy config shape persisted before the workspace rename.
 * Used to migrate AsyncStorage payloads that still use `environmentId` / `environment`.
 */
export type TLegacyConfig = TConfig & {
  environmentId?: string;
  environment?: {
    expiresAt: Date;
    data: {
      surveys: TSurvey[];
      actionClasses: TWorkspaceStateActionClass[];
      project?: TWorkspaceStateSettings;
      settings?: TWorkspaceStateSettings;
    };
  };
};

export interface TWebViewOnMessageData {
  onFinished?: boolean | null;
  onDisplay?: boolean | null;
  onResponse?: boolean | null;
  responseUpdate?: TResponseUpdate | null;
  onRetry?: boolean | null;
  onClose?: boolean | null;
  onFileUpload?: boolean | null;
  fileUploadParams?: TFileUploadParams | null;
  uploadId?: string | null;
}

export const ZJsRNWebViewOnMessageData = z.object({
  onFinished: z.boolean().nullish(),
  onDisplayCreated: z.boolean().nullish(),
  onResponseCreated: z.boolean().nullish(),
  onClose: z.boolean().nullish(),
  onFilePick: z.boolean().nullish(),
  fileUploadParams: z
    .object({
      allowedFileExtensions: z.string().nullish(),
      allowMultipleFiles: z.boolean().nullish(),
    })
    .nullish(),
  onOpenExternalURL: z.boolean().nullish(),
  onOpenExternalURLParams: z
    .object({
      url: z.string(),
    })
    .nullish(),
});

export interface TUpdates {
  userId: string;
  attributes?: TAttributes;
}
