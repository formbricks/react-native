export const getSurveyScriptUrl = (appUrl?: string): string => {
  const url = new URL(appUrl ?? "http://localhost:3000");

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Formbricks appUrl must use http or https");
  }

  const basePath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.pathname = `${basePath}js/surveys.umd.cjs`;
  url.search = "";
  url.hash = "";

  return url.toString();
};
