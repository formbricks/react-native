import type {
  TEnvironmentState,
  TEnvironmentStateProject,
  TProjectStyling,
  TUserState,
} from "@/types/config";
import type { Result } from "@/types/error";
import type { TSurvey } from "@/types/survey";

// Helper function to calculate difference in days between two dates
export const diffInDays = (date1: Date, date2: Date): number => {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

export const wrapThrowsAsync =
  <T, A extends unknown[]>(fn: (...args: A) => Promise<T>) =>
  async (...args: A): Promise<Result<T>> => {
    try {
      return {
        ok: true,
        data: await fn(...args),
      };
    } catch (error) {
      return {
        ok: false,
        error: error as Error,
      };
    }
  };

/**
 * Filters surveys based on the displayOption, recontactDays, and segments
 * @param environmentSate -  The environment state
 * @param userState - The user state
 * @returns The filtered surveys
 */

// takes the environment and user state and returns the filtered surveys
export const filterSurveys = (
  environmentState: TEnvironmentState,
  userState: TUserState
): TSurvey[] => {
  const { project, surveys } = environmentState.data;
  const { displays, responses, lastDisplayAt, segments, userId } =
    userState.data;

  // Function to filter surveys based on displayOption criteria
  let filteredSurveys = surveys.filter((survey: TSurvey) => {
    switch (survey.displayOption) {
      case "respondMultiple":
        return true;
      case "displayOnce":
        return (
          displays.filter((display) => display.surveyId === survey.id)
            .length === 0
        );
      case "displayMultiple":
        return (
          responses.filter((surveyId) => surveyId === survey.id).length === 0
        );

      case "displaySome":
        if (survey.displayLimit === null) {
          return true;
        }

        // Check if survey response exists, if so, stop here
        if (responses.filter((surveyId) => surveyId === survey.id).length) {
          return false;
        }

        // Otherwise, check if displays length is less than displayLimit
        return (
          displays.filter((display) => display.surveyId === survey.id).length <
          survey.displayLimit
        );

      default:
        throw Error("Invalid displayOption");
    }
  });

  // filter surveys that meet the recontactDays criteria
  filteredSurveys = filteredSurveys.filter((survey) => {
    // if no survey was displayed yet, show the survey
    if (!lastDisplayAt) {
      return true;
    }

    // if survey has recontactDays, check if the last display was more than recontactDays ago
    // The previous approach checked the last display for each survey which is why we still have a surveyId in the displays array.
    // NOSONAR
    // TODO: Remove the surveyId from the displays array
    if (survey.recontactDays !== null) {
      return (
        diffInDays(new Date(), new Date(lastDisplayAt)) >= survey.recontactDays
      );
    }

    // use recontactDays of the project if survey does not have recontactDays
    if (project.recontactDays) {
      return (
        diffInDays(new Date(), new Date(lastDisplayAt)) >= project.recontactDays
      );
    }

    // if no recontactDays is set, show the survey

    return true;
  });

  if (!userId) {
    // exclude surveys that have a segment with filters
    return filteredSurveys.filter((survey) => {
      const segmentFiltersLength = survey.segment?.filters?.length ?? 0;
      return segmentFiltersLength === 0;
    });
  }

  if (!segments.length) {
    return [];
  }

  // filter surveys based on segments
  return filteredSurveys.filter((survey) => {
    return survey.segment?.id && segments.includes(survey.segment.id);
  });
};

export const getStyling = (
  project: TEnvironmentStateProject,
  survey: TSurvey
): TProjectStyling | TSurvey["styling"] => {
  // allow style overwrite is enabled from the project
  if (project.styling.allowStyleOverwrite) {
    // survey style overwrite is disabled
    if (!survey.styling?.overwriteThemeStyling) {
      return project.styling;
    }

    // survey style overwrite is enabled
    return survey.styling;
  }

  // allow style overwrite is disabled from the project
  return project.styling;
};

export const getDefaultLanguageCode = (survey: TSurvey): string | undefined => {
  const defaultSurveyLanguage = survey.languages.find((surveyLanguage) => {
    return surveyLanguage.default;
  });
  if (defaultSurveyLanguage) return defaultSurveyLanguage.language.code;
};

export const getLanguageCode = (
  survey: TSurvey,
  language?: string
): string | undefined => {
  const availableLanguageCodes = survey.languages.map(
    (surveyLanguage) => surveyLanguage.language.code
  );
  if (!language) return "default";

  const selectedLanguage = survey.languages.find((surveyLanguage) => {
    return (
      surveyLanguage.language.code === language.toLowerCase() ||
      surveyLanguage.language.alias?.toLowerCase() === language.toLowerCase()
    );
  });
  if (selectedLanguage?.default) {
    return "default";
  }
  if (
    !selectedLanguage ||
    !selectedLanguage.enabled ||
    !availableLanguageCodes.includes(selectedLanguage.language.code)
  ) {
    return undefined;
  }
  return selectedLanguage.language.code;
};

export const shouldDisplayBasedOnPercentage = (
  displayPercentage: number
): boolean => {
  const randomNum = Math.floor(Math.random() * 10000) / 100;
  return randomNum <= displayPercentage;
};

export const isNowExpired = (expirationDate: Date): boolean => {
  return new Date() >= expirationDate;
};

export const delayedResult = async <T>(value: T, ms: number): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
};
