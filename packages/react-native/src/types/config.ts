/* eslint-disable import/no-extraneous-dependencies -- required for Prisma types */
import { type TResponseUpdate } from "@/types/response";
import { type TFileUploadParams } from "@/types/storage";
import { z } from "zod";
import { type TActionClass } from "./action-class";
import type { TProject, TProjectStyling } from "./project";
import type { TSurvey } from "./survey";

export type TEnvironmentStateProject = Pick<
  TProject,
  | "id"
  | "recontactDays"
  | "clickOutsideClose"
  | "darkOverlay"
  | "placement"
  | "inAppSurveyBranding"
> & {
  styling: TProjectStyling;
};

export type TEnvironmentStateActionClass = Pick<
  TActionClass,
  "id" | "key" | "type" | "name" | "noCodeConfig"
>;

export interface TEnvironmentState {
  expiresAt: Date;
  data: {
    surveys: TSurvey[];
    actionClasses: TEnvironmentStateActionClass[];
    project: TEnvironmentStateProject;
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
  environmentId: string;
  appUrl: string;
  environment: TEnvironmentState;
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

export type TAttributes = Record<string, string>;

export interface TConfigInput {
  environmentId: string;
  appUrl: string;
}




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
