import type { TOverlay } from "./common";
import type { TBaseStyling } from "./styling";

export type TProject = {
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
};

export interface TProjectStyling extends TBaseStyling {
  allowStyleOverwrite: boolean;
}
