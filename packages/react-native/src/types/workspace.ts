import type { TOverlay } from "./common";
import type { TBaseStyling } from "./styling";

/** Compiled custom CSS for one scope; either mode may be absent. Passed to the renderer untouched. */
export interface TCustomCss {
  light?: string;
  dark?: string;
}

export interface TWorkspace {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  organizationId: string;
  styling: {
    allowStyleOverwrite: boolean;
    brandColor?: string | null;
    highlightBorderColor?: string | null;
  };
  recontactDays: number;
  inAppSurveyBranding: boolean;
  linkSurveyBranding: boolean;
  config: {
    channel: "link" | "app" | "website" | null;
    industry: "eCommerce" | "saas" | "other" | null;
  };
  placement: "topLeft" | "topRight" | "bottomLeft" | "bottomRight"; // assumed from WidgetPlacement
  clickOutsideClose: boolean;
  overlay: TOverlay;
  logo?: {
    url?: string;
    bgColor?: string;
  } | null;
}

export interface TWorkspaceStyling extends TBaseStyling {
  allowStyleOverwrite: boolean;
}
