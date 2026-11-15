import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveRelease } from "./resolve-release.mjs";

const CLI = fileURLToPath(new URL("./resolve-release.mjs", import.meta.url));

function runCli({ tag, prerelease }) {
  const dir = mkdtempSync(join(tmpdir(), "resolve-release-"));
  const manifest = join(dir, "package.json");
  const output = join(dir, "github-output");
  writeFileSync(
    manifest,
    `${JSON.stringify({ name: "@formbricks/react-native", version: "0.0.0-dev", private: false }, null, 2)}\n`,
  );
  writeFileSync(output, "");
  const result = spawnSync(process.execPath, [CLI], {
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_TAG: tag,
      RELEASE_PRERELEASE: prerelease,
      PACKAGE_JSON: manifest,
      GITHUB_OUTPUT: output,
    },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    manifest: readFileSync(manifest, "utf8"),
    output: readFileSync(output, "utf8"),
  };
}

describe("resolve-release CLI", () => {
  it("writes the tag version into the manifest and exposes the dist-tag", () => {
    const run = runCli({ tag: "3.4.0-rc.1", prerelease: "true" });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(
      run.manifest,
      `{\n  "name": "@formbricks/react-native",\n  "version": "3.4.0-rc.1",\n  "private": false\n}\n`,
    );
    assert.equal(run.output, "version=3.4.0-rc.1\ndist_tag=next\n");
  });

  it("fails without touching the manifest when the tag is invalid", () => {
    const run = runCli({ tag: "v3.4.0", prerelease: "false" });

    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /not a valid release tag/);
    assert.match(run.manifest, /"version": "0.0.0-dev"/);
    assert.equal(run.output, "");
  });
});

describe("resolveRelease", () => {
  it("publishes a stable tag to latest", () => {
    assert.deepEqual(resolveRelease({ tag: "3.4.0", prerelease: false }), {
      version: "3.4.0",
      distTag: "latest",
    });
  });

  it("publishes a prerelease tag to next", () => {
    assert.deepEqual(resolveRelease({ tag: "3.4.0-rc.1", prerelease: true }), {
      version: "3.4.0-rc.1",
      distTag: "next",
    });
  });

  it("rejects a prerelease tag on a release not marked as a pre-release", () => {
    assert.throws(
      () => resolveRelease({ tag: "3.4.0-rc.1", prerelease: false }),
      /mark the GitHub release as a pre-release/,
    );
  });

  it("rejects a stable tag on a release marked as a pre-release", () => {
    assert.throws(
      () => resolveRelease({ tag: "3.4.0", prerelease: true }),
      /untick "Set as a pre-release"/,
    );
  });

  for (const tag of [
    "v3.4.0",
    "3.4",
    "03.4.0",
    "3.4.0-",
    "3.4.0-rc.01",
    "3.4.0+build.1",
    "release-3.4.0",
    " 3.4.0",
    "",
  ]) {
    it(`rejects ${JSON.stringify(tag)}, which is not a bare semver tag`, () => {
      assert.throws(
        () => resolveRelease({ tag, prerelease: false }),
        /not a valid release tag/,
      );
    });
  }
});
