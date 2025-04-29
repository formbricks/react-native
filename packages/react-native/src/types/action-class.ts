export type TActionClass = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  description: string | null;
  type: "code" | "noCode";
  key: string | null;
  noCodeConfig:
    | {
        type: "click";
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
        elementSelector: {
          cssSelector?: string;
          innerHtml?: string;
        };
      }
    | {
        type: "pageView" | "exitIntent" | "fiftyPercentScroll";
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
      }
    | null;
  environmentId: string;
};
