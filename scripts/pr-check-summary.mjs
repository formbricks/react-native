import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Decides the `PR Check Summary` verdict from the `needs` context of ci.yml.
// Every job must succeed, except these explicitly allowed skips:
// - sonarqube and e2e-tests on a fork PR (no secrets there),
// - dependency-review on a push to main (it only runs on pull_request and merge_group).
const SKIPPABLE_ON_FORK_PR = new Set(["sonarqube", "e2e-tests"]);
const SKIPPABLE_ON_PUSH = new Set(["dependency-review"]);

function isAllowedSkip(job, { eventName, isFork }) {
  if (isFork && eventName === "pull_request" && SKIPPABLE_ON_FORK_PR.has(job)) {
    return true;
  }
  return eventName === "push" && SKIPPABLE_ON_PUSH.has(job);
}

export function evaluate({ needs, eventName, isFork }) {
  const problems = Object.entries(needs)
    .filter(
      ([job, { result }]) =>
        result !== "success" &&
        !(result === "skipped" && isAllowedSkip(job, { eventName, isFork })),
    )
    .map(([job, { result }]) => ({ job, result }));
  return { passed: problems.length === 0, problems };
}

function main() {
  const needs = JSON.parse(process.env.NEEDS_JSON ?? "{}");
  const eventName = process.env.EVENT_NAME ?? "";
  const isFork = process.env.IS_FORK === "true";
  const { passed, problems } = evaluate({ needs, eventName, isFork });

  const lines = Object.entries(needs).map(
    ([job, { result }]) => `- ${job}: ${result}`,
  );
  const verdict = passed
    ? "All required checks passed."
    : `Failing checks: ${problems.map(({ job }) => job).join(", ")}`;
  const report = [...lines, "", verdict].join("\n");

  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## PR Check Summary\n\n${report}\n`,
    );
  }
  process.exitCode = passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
