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
  darkOverlay: boolean;
  logo?: {
    url?: string;
    bgColor?: string;
  } | null;
};
