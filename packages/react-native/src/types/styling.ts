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
