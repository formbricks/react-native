import type { TResponseData, TResponseUpdate } from "@/types/response";
import type { TFileUploadParams, TUploadFileConfig } from "@/types/storage";
import type { TProjectStyling } from "./project";

export type TJsFileUploadParams = {
  file: {
    type: string;
    name: string;
    base64: string;
  };
  params: {
    maxSizeInMB?: number;
    folder?: string;
    allowedExtensions?: string[];
  };
};

export interface SurveyBaseProps {
  survey: TSurvey;
  styling: TSurvey["styling"] | TProjectStyling;
  isBrandingEnabled: boolean;
  getSetIsError?: (getSetError: (value: boolean) => void) => void;
  getSetIsResponseSendingFinished?: (
    getSetIsResponseSendingFinished: (value: boolean) => void
  ) => void;
  getSetQuestionId?: (getSetQuestionId: (value: string) => void) => void;
  getSetResponseData?: (
    getSetResponseData: (value: TResponseData) => void
  ) => void;
  onDisplay?: () => void;
  onResponse?: (response: TResponseUpdate) => void;
  onFinished?: () => void;
  onClose?: () => void;
  onRetry?: () => void;
  autoFocus?: boolean;
  isRedirectDisabled?: boolean;
  prefillResponseData?: TResponseData;
  skipPrefilled?: boolean;
  languageCode: string;
  onFileUpload: (
    file: TFileUploadParams["file"],
    config?: TUploadFileConfig
  ) => Promise<string>;
  responseCount?: number;
  isCardBorderVisible?: boolean;
  startAtQuestionId?: string;
  clickOutside?: boolean;
  darkOverlay?: boolean;
  hiddenFieldsRecord?: TResponseData;
  shouldResetQuestionId?: boolean;
  fullSizeCards?: boolean;
}

export interface SurveyInlineProps extends SurveyBaseProps {
  containerId: string;
  placement: "bottomLeft" | "bottomRight" | "topLeft" | "topRight" | "center";
}

export interface SurveyContainerProps
  extends Omit<SurveyBaseProps, "onFileUpload"> {
  appUrl?: string;
  environmentId?: string;
  userId?: string;
  contactId?: string;
  onDisplayCreated?: () => void | Promise<void>;
  onResponseCreated?: () => void | Promise<void>;
  onFileUpload?: (
    file: TJsFileUploadParams["file"],
    config?: TUploadFileConfig
  ) => Promise<string>;
  onOpenExternalURL?: (url: string) => void | Promise<void>;
  mode?: "modal" | "inline";
  containerId?: string;
  clickOutside?: boolean;
  darkOverlay?: boolean;
  placement?: "bottomLeft" | "bottomRight" | "topLeft" | "topRight" | "center";
  action?: string;
  singleUseId?: string;
  singleUseResponseId?: string;
  isWebEnvironment?: boolean;
}

export type TSurvey = {
  id: string;
  name: string;
  welcomeCard: {
    enabled: boolean;
    headline?: Record<string, string>;
    html?: Record<string, string>;
    fileUrl?: string;
    buttonLabel?: Record<string, string>;
    timeToFinish: boolean;
    showResponseCount: boolean;
    videoUrl?: string;
  };
  questions: {
    id: string;
    type: string;
    headline: Record<string, string>;
    subheader?: Record<string, string>;
    imageUrl?: string;
    videoUrl?: string;
    required: boolean;
    buttonLabel?: Record<string, string>;
    backButtonLabel?: Record<string, string>;
    scale?: "number" | "smiley" | "star";
    range?: 3 | 4 | 5 | 7 | 10;
    logic?: any[]; // Recursive deep structure, can be expanded if needed
    logicFallback?: string;
    isDraft?: boolean;
    placeholder?: Record<string, string>;
    longAnswer?: boolean;
    inputType?: "text" | "email" | "url" | "number" | "phone";
    insightsEnabled?: boolean;
    charLimit?: {
      enabled: boolean;
      min?: number;
      max?: number;
    };
    choices?: {
      id: string;
      label: Record<string, string>;
    }[];
    shuffleOption?: "none" | "all" | "exceptLast";
    otherOptionPlaceholder?: Record<string, string>;
    lowerLabel?: Record<string, string>;
    upperLabel?: Record<string, string>;
    html?: Record<string, string>;
    buttonUrl?: string;
    buttonExternal?: boolean;
    dismissButtonLabel?: Record<string, string>;
    allowMulti?: boolean;
    format?: "M-d-y" | "d-M-y" | "y-M-d";
    allowMultipleFiles?: boolean;
    maxSizeInMB?: number;
    allowedFileExtensions?: string[];
    calUserName?: string;
    calHost?: string;
    rows?: Record<string, string>[];
    columns?: Record<string, string>[];
    addressLine1?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    addressLine2?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    city?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    state?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    zip?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    country?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    firstName?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    lastName?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    email?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    phone?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
    company?: {
      show: boolean;
      required: boolean;
      placeholder: Record<string, string>;
    };
  }[];
  variables: {
    id: string;
    name: string;
    type: "number" | "text";
    value: number | string;
  }[];
  type: "link" | "app";
  showLanguageSwitch: boolean | null;
  endings: {
    id: string;
    type: "endScreen" | "redirectToUrl";
    headline?: Record<string, string>;
    subheader?: Record<string, string>;
    buttonLabel?: Record<string, string>;
    buttonLink?: string;
    imageUrl?: string;
    videoUrl?: string;
    url?: string;
    label?: string;
  }[];
  autoClose: number | null;
  status: "draft" | "scheduled" | "inProgress" | "paused" | "completed";
  recontactDays: number | null;
  displayLimit: number | null;
  displayOption:
  | "displayOnce"
  | "displayMultiple"
  | "respondMultiple"
  | "displaySome";
  hiddenFields: {
    enabled: boolean;
    fieldIds?: string[];
  };
  delay: number;
  projectOverwrites: {
    brandColor?: string | null;
    highlightBorderColor?: string | null;
    placement?:
    | "topLeft"
    | "topRight"
    | "bottomLeft"
    | "bottomRight"
    | "center"
    | null;
    clickOutsideClose?: boolean | null;
    darkOverlay?: boolean | null;
  } | null;
  languages: {
    default: boolean;
    enabled: boolean;
    language: {
      id: string;
      createdAt: string;
      updatedAt: string;
      code: string;
      alias: string | null;
      projectId: string;
    };
  }[];
  triggers: {
    actionClass: {
      id: string;
      createdAt: string;
      updatedAt: string;
      name: string;
      description: string | null;
      type: "code" | "noCode";
      key: string | null;
      noCodeConfig: {
        type: "click" | "pageView" | "exitIntent" | "fiftyPercentScroll";
        urlFilters: {
          value: string;
          rule:
          | "exactMatch"
          | "contains"
          | "startsWith"
          | "endsWith"
          | "notMatch"
          | "notContains";
        }[];
        elementSelector?: {
          cssSelector?: string;
          innerHtml?: string;
        };
      } | null;
      environmentId: string;
    };
  }[];
  segment?: {
    id: string;
    title: string;
    description: string | null;
    isPrivate: boolean;
    filters: any; // recursive, optional to expand
    environmentId: string;
    createdAt: string;
    updatedAt: string;
    surveys: string[];
  };
  displayPercentage: number;
  styling?: {
    brandColor?: {
      light: string;
      dark?: string | null;
    } | null;
    backgroundColor?: {
      light: string;
      dark?: string | null;
    } | null;
    highlightBorderColor?: {
      light: string;
      dark?: string | null;
    } | null;
    textColor?: {
      light: string;
      dark?: string | null;
    } | null;
    borderColor?: {
      light: string;
      dark?: string | null;
    } | null;
    overwriteThemeStyling?: boolean | null;
  };
};

export interface TStylingColor {
  light: string;
  dark?: string | null;
}

export interface TBaseStyling {
  brandColor?: TStylingColor | null;
  questionColor?: TStylingColor | null;
  inputColor?: TStylingColor | null;
  inputBorderColor?: TStylingColor | null;
  cardBackgroundColor?: TStylingColor | null;
  cardBorderColor?: TStylingColor | null;
  cardShadowColor?: TStylingColor | null;
  highlightBorderColor?: TStylingColor | null;
  isDarkModeEnabled?: boolean | null;
  roundness?: number | null;
  cardArrangement?: {
    linkSurveys: "casual" | "straight" | "simple";
    appSurveys: "casual" | "straight" | "simple";
  } | null;
  background?: {
    bg?: string | null;
    bgType?: "animation" | "color" | "image" | "upload" | null;
    brightness?: number | null;
  } | null;
  hideProgressBar?: boolean | null;
  isLogoHidden?: boolean | null;
}