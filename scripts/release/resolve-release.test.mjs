import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compareVersions, resolveRelease } from "./resolve-release.mjs";

describe("resolveRelease", () => {
  it("publishes the first stable version to the latest dist-tag", () => {
    assert.deepEqual(resolveRelease({ tag: "5.4.0", prerelease: false }), {
      version: "5.4.0",
      distTag: "latest",
    });
  });

  it("publishes a stable version newer than the current latest to latest", () => {
    assert.deepEqual(
      resolveRelease({ tag: "5.4.0", prerelease: false, latest: "5.3.9" }),
      { version: "5.4.0", distTag: "latest" },
    );
  });

  it("keeps a re-run of the current latest on latest", () => {
    assert.deepEqual(
      resolveRelease({ tag: "5.4.0", prerelease: false, latest: "5.4.0" }),
      { version: "5.4.0", distTag: "latest" },
    );
  });

  it("publishes a backport older than the current latest to release-<major>.<minor>", () => {
    assert.deepEqual(
      resolveRelease({ tag: "5.3.2", prerelease: false, latest: "5.4.0" }),
      { version: "5.3.2", distTag: "release-5.3" },
    );
  });

  it("publishes a backport to an older major to that major's release line", () => {
    assert.deepEqual(
      resolveRelease({ tag: "4.9.2", prerelease: false, latest: "5.4.0" }),
      { version: "4.9.2", distTag: "release-4.9" },
    );
  });

  it("compares versions numerically, not as strings", () => {
    assert.deepEqual(
      resolveRelease({ tag: "5.10.0", prerelease: false, latest: "5.9.0" }),
      { version: "5.10.0", distTag: "latest" },
    );
  });

  it("publishes a prerelease to next, whatever the current latest is", () => {
    assert.deepEqual(
      resolveRelease({ tag: "5.4.0-rc.1", prerelease: true, latest: "5.3.0" }),
      { version: "5.4.0-rc.1", distTag: "next" },
    );
    assert.deepEqual(
      resolveRelease({ tag: "5.3.1-rc.1", prerelease: true, latest: "5.4.0" }),
      { version: "5.3.1-rc.1", distTag: "next" },
    );
  });

  for (const tag of ["v5.4.0", "v5.4.0-rc.1", "V5.4.0"]) {
    it(`rejects the "v" prefix in "${tag}"`, () => {
      assert.throws(
        () => resolveRelease({ tag, prerelease: tag.includes("-") }),
        /not a valid release tag.*without a "v" prefix/,
      );
    });
  }

  for (const tag of [
    "5.4",
    "5.4.0.1",
    "05.4.0",
    "5.4.0-",
    "5.4.0-rc..1",
    "5.4.0+build.7",
    "release-5.4.0",
    "",
  ]) {
    it(`rejects the tag "${tag}" because it is not plain semver`, () => {
      assert.throws(
        () => resolveRelease({ tag, prerelease: false }),
        /not a valid release tag/,
      );
    });
  }

  it("refuses a prerelease tag on a release not marked as prerelease", () => {
    assert.throws(
      () => resolveRelease({ tag: "5.4.0-rc.1", prerelease: false }),
      /not marked as a pre-release/,
    );
  });

  it("refuses a stable tag on a release marked as prerelease", () => {
    assert.throws(
      () => resolveRelease({ tag: "5.4.0", prerelease: true }),
      /marked as a pre-release/,
    );
  });

  it("refuses a current latest that is not a semver version", () => {
    assert.throws(
      () => resolveRelease({ tag: "5.4.0", prerelease: false, latest: "nope" }),
      /current "latest" version "nope" is not a semver version/,
    );
  });
});

describe("compareVersions", () => {
  it("orders versions by SemVer precedence", () => {
    // The example ordering from https://semver.org/#spec-item-11, plus numeric fields.
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.2.0",
      "1.10.0",
      "2.0.0",
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      assert.ok(
        compareVersions(ordered[i], ordered[i + 1]) < 0,
        `${ordered[i]} < ${ordered[i + 1]}`,
      );
      assert.ok(
        compareVersions(ordered[i + 1], ordered[i]) > 0,
        `${ordered[i + 1]} > ${ordered[i]}`,
      );
    }
    assert.equal(compareVersions("1.0.0-rc.1", "1.0.0-rc.1"), 0);
  });
});

describe("resolve-release CLI", () => {
  const script = fileURLToPath(
    new URL("./resolve-release.mjs", import.meta.url),
  );
  const run = (args) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });

  it("prints the version and dist-tag as GitHub step outputs", () => {
    const result = run(["5.4.0-beta.2", "true", "--latest", "5.3.0"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "version=5.4.0-beta.2\ndist-tag=next\n");
  });

  it("publishes a backport to its release line", () => {
    const result = run(["5.3.2", "false", "--latest", "5.4.0"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "version=5.3.2\ndist-tag=release-5.3\n");
  });

  it("treats an empty --latest as a package with no latest yet", () => {
    const result = run(["5.4.0", "false", "--latest", ""]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "version=5.4.0\ndist-tag=latest\n");
  });

  it("fails with a GitHub error annotation on an invalid tag", () => {
    const result = run(["nightly", "false"]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /^::error::Tag "nightly" is not a valid release tag/,
    );
  });

  it("fails when the prerelease flag is not true or false", () => {
    const result = run(["5.4.0", "yes"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /<prerelease> must be "true" or "false"/);
  });

  it("fails with a usage error when an argument is missing", () => {
    const result = run(["5.4.0"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /::error::Usage: resolve-release\.mjs/);
  });
});
