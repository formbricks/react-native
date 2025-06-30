import { z } from "zod";

export interface TUploadFileConfig {
  allowedFileExtensions?: string[];
  surveyId?: string;
}

export interface TUploadFileResponse {
  data: {
    signedUrl: string;
    fileUrl: string;
    signingData: {
      signature: string;
      timestamp: number;
      uuid: string;
    } | null;
    updatedFileName: string;
    presignedFields?: Record<string, string>;
  };
}

export interface TFileUploadParams {
  file: { type: string; name: string; base64: string };
  params: TUploadFileConfig;
}

export const ZUploadFileConfig = z.object({
  allowedFileExtensions: z.array(z.string()).optional(),
  surveyId: z.string().optional(),
});

export const ZFileUploadParams = z.object({
  file: z.object({ type: z.string(), name: z.string(), base64: z.string() }),
  params: ZUploadFileConfig,
});
