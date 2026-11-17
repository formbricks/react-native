import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluate } from "./pr-check-summary.mjs";

const needs = (results) =>
  Object.fromEntries(
    Object.entries(results).map(([job, result]) => [job, { result }]),
  );

describe("evaluate", () => {
  it("passes when every job succeeded", () => {
    const verdict = evaluate({
      needs: needs({ lint: "success", build: "success" }),
      eventName: "pull_request",
      isFork: false,
    });

    assert.deepEqual(verdict, { passed: true, problems: [] });
  });

  it("fails on a failed, cancelled or skipped job and names each one", () => {
    const verdict = evaluate({
      needs: needs({
        lint: "failure",
        build: "cancelled",
        "unit-tests": "skipped",
        format: "success",
      }),
      eventName: "pull_request",
      isFork: false,
    });

    assert.deepEqual(verdict, {
      passed: false,
      problems: [
        { job: "lint", result: "failure" },
        { job: "build", result: "cancelled" },
        { job: "unit-tests", result: "skipped" },
      ],
    });
  });

  it("allows sonarqube and e2e-tests to skip on a fork PR", () => {
    const verdict = evaluate({
      needs: needs({
        lint: "success",
        sonarqube: "skipped",
        "e2e-tests": "skipped",
      }),
      eventName: "pull_request",
      isFork: true,
    });

    assert.deepEqual(verdict, { passed: true, problems: [] });
  });

  it("does not let other jobs skip on a fork PR", () => {
    const verdict = evaluate({
      needs: needs({ sonarqube: "skipped", "unit-tests": "skipped" }),
      eventName: "pull_request",
      isFork: true,
    });

    assert.deepEqual(verdict.problems, [
      { job: "unit-tests", result: "skipped" },
    ]);
  });

  it("does not let sonarqube skip on a same-repo PR", () => {
    const verdict = evaluate({
      needs: needs({ sonarqube: "skipped" }),
      eventName: "pull_request",
      isFork: false,
    });

    assert.equal(verdict.passed, false);
  });

  it("still reports a sonarqube failure on a fork PR", () => {
    const verdict = evaluate({
      needs: needs({ sonarqube: "failure" }),
      eventName: "pull_request",
      isFork: true,
    });

    assert.deepEqual(verdict.problems, [
      { job: "sonarqube", result: "failure" },
    ]);
  });

  it("allows dependency-review to skip on a push to main", () => {
    const verdict = evaluate({
      needs: needs({ "dependency-review": "skipped", lint: "success" }),
      eventName: "push",
      isFork: false,
    });

    assert.deepEqual(verdict, { passed: true, problems: [] });
  });

  it("requires dependency-review in the merge queue", () => {
    const verdict = evaluate({
      needs: needs({ "dependency-review": "skipped" }),
      eventName: "merge_group",
      isFork: false,
    });

    assert.deepEqual(verdict.problems, [
      { job: "dependency-review", result: "skipped" },
    ]);
  });
});

describe("pr-check-summary CLI", () => {
  const script = fileURLToPath(
    new URL("./pr-check-summary.mjs", import.meta.url),
  );
  const run = (env) =>
    spawnSync(process.execPath, [script], {
      env: { PATH: process.env.PATH, ...env },
      encoding: "utf8",
    });

  it("exits 1 and names the failing job", () => {
    const { status, stdout } = run({
      NEEDS_JSON: JSON.stringify(needs({ lint: "failure", build: "success" })),
      EVENT_NAME: "pull_request",
      IS_FORK: "false",
    });

    assert.equal(status, 1);
    assert.match(stdout, /lint: failure/);
  });

  it("exits 0 when a fork PR skips sonarqube", () => {
    const { status } = run({
      NEEDS_JSON: JSON.stringify(needs({ sonarqube: "skipped" })),
      EVENT_NAME: "pull_request",
      IS_FORK: "true",
    });

    assert.equal(status, 0);
  });
});
