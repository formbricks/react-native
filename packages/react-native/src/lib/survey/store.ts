import type { TSurvey } from "@/types/survey";

type Listener = (state: TSurvey | null, prevSurvey: TSurvey | null) => void;

export class SurveyStore {
  private static instance: SurveyStore | undefined;
  private survey: TSurvey | null = null;
  private readonly listeners = new Set<Listener>();

  static getInstance(): SurveyStore {
    SurveyStore.instance ??= new SurveyStore();
    return SurveyStore.instance;
  }

  public getSurvey(): TSurvey | null {
    return this.survey;
  }

  public setSurvey(survey: TSurvey): void {
    const prevSurvey = this.survey;
    if (prevSurvey?.id !== survey.id) {
      this.survey = survey;
      this.listeners.forEach((listener) => {
        listener(this.survey, prevSurvey);
      });
    }
  }

  public resetSurvey(): void {
    const prevSurvey = this.survey;
    if (prevSurvey !== null) {
      this.survey = null;
      this.listeners.forEach((listener) => {
        listener(this.survey, prevSurvey);
      });
    }
  }

  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    // Unsubscribe
    return () => this.listeners.delete(listener);
  }
}
