export const getSurveyScriptUrl = (appUrl?: string): string | null => {
  if (!appUrl) {
    return null;
  }

  try {
    const url = new URL(appUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    const basePath = url.pathname.endsWith("/")
      ? url.pathname
      : `${url.pathname}/`;
    url.pathname = `${basePath}js/surveys.umd.cjs`;
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
};
