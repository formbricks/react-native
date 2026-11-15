import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// SemVer 2.0.0 (https://semver.org), without the "v" prefix and without build
// metadata: npm drops build metadata on publish, so the published version would
// no longer match the tag.
const NUMERIC = "0|[1-9]\\d*";
const PRERELEASE_ID = `(?:${NUMERIC}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;
const SEMVER = new RegExp(
  `^(?:${NUMERIC})\\.(?:${NUMERIC})\\.(?:${NUMERIC})(?:-${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*)?$`,
);

export function resolveRelease({ tag, prerelease }) {
  if (!SEMVER.test(tag)) {
    throw new Error(
      `"${tag}" is not a valid release tag. Use a bare semver version such as 3.4.0 or 3.4.0-rc.1.`,
    );
  }
  const tagIsPrerelease = tag.includes("-");
  if (tagIsPrerelease && !prerelease) {
    throw new Error(
      `Tag ${tag} is a prerelease version: mark the GitHub release as a pre-release so it ships to the npm "next" dist-tag.`,
    );
  }
  if (!tagIsPrerelease && prerelease) {
    throw new Error(
      `Tag ${tag} is a stable version: untick "Set as a pre-release" on the GitHub release, or use a prerelease tag such as ${tag}-rc.1.`,
    );
  }
  return { version: tag, distTag: prerelease ? "next" : "latest" };
}

// CLI: RELEASE_TAG, RELEASE_PRERELEASE ("true"/"false") and PACKAGE_JSON in,
// version and dist_tag out through $GITHUB_OUTPUT.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { RELEASE_TAG, RELEASE_PRERELEASE, PACKAGE_JSON, GITHUB_OUTPUT } =
      process.env;
    const { version, distTag } = resolveRelease({
      tag: RELEASE_TAG ?? "",
      prerelease: RELEASE_PRERELEASE === "true",
    });
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
    manifest.version = version;
    writeFileSync(PACKAGE_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
    appendFileSync(GITHUB_OUTPUT, `version=${version}\ndist_tag=${distTag}\n`);
    console.log(
      `Releasing ${manifest.name}@${version} to dist-tag "${distTag}".`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
