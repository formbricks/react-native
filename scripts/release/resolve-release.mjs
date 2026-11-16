// Resolves the npm version and dist-tag from a GitHub release. Writes no files: a separate
// workflow step stamps the version into the manifest.
//
//   node scripts/release/resolve-release.mjs <tag> <prerelease> [--latest <version>]
//
// <prerelease> is the GitHub release's "pre-release" box ("true" or "false"). --latest is the
// version the package's `latest` dist-tag points at now (empty or omitted when there is none;
// `npm-registry.mjs latest <package>` prints it). Prints `version=<semver>` and
// `dist-tag=<next|latest|release-MAJOR.MINOR>` as GitHub step outputs.

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// SemVer 2.0.0 without build metadata (https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string).
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

const USAGE =
  "Usage: resolve-release.mjs <tag> <prerelease: true|false> [--latest <version>]";

// Returns { major, minor, patch, prerelease: string[] } or null when `version` is not semver.
export function parseVersion(version) {
  const match = SEMVER.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split("."),
  };
}

function compareIdentifiers(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// SemVer precedence (https://semver.org/#spec-item-11): negative, zero or positive.
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    throw new Error(`Cannot compare "${a}" with "${b}": not semver versions.`);
  }
  for (const field of ["major", "minor", "patch"]) {
    if (left[field] !== right[field]) return left[field] - right[field];
  }
  // A version without a prerelease ranks above the same version with one.
  if (!left.prerelease.length || !right.prerelease.length) {
    return right.prerelease.length - left.prerelease.length;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < length; i++) {
    if (left.prerelease[i] === undefined) return -1;
    if (right.prerelease[i] === undefined) return 1;
    const order = compareIdentifiers(left.prerelease[i], right.prerelease[i]);
    if (order !== 0) return order;
  }
  return 0;
}

// The release line a backport publishes to, so it never moves `latest`.
export function releaseLineTag({ major, minor }) {
  return `release-${major}.${minor}`;
}

export function resolveRelease({ tag, prerelease, latest }) {
  const parsed = parseVersion(tag);
  if (!parsed) {
    throw new Error(
      `Tag "${tag}" is not a valid release tag. Use MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-PRERELEASE without a "v" prefix (build metadata is not allowed).`,
    );
  }
  const isPrerelease = parsed.prerelease.length > 0;
  if (isPrerelease && !prerelease) {
    throw new Error(
      `Tag "${tag}" is a prerelease version, but the GitHub release is not marked as a pre-release. Recreate the release on the same tag with "Set as a pre-release" ticked.`,
    );
  }
  if (!isPrerelease && prerelease) {
    throw new Error(
      `Tag "${tag}" is a stable version, but the GitHub release is marked as a pre-release. Recreate the release on the same tag with "Set as a pre-release" unticked.`,
    );
  }
  if (latest && !parseVersion(latest)) {
    throw new Error(
      `The current "latest" version "${latest}" is not a semver version.`,
    );
  }

  const version = tag;
  if (isPrerelease) return { version, distTag: "next" };
  if (!latest || compareVersions(version, latest) >= 0) {
    return { version, distTag: "latest" };
  }
  return { version, distTag: releaseLineTag(parsed) };
}

function parseFlag(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`<prerelease> must be "true" or "false", got "${value}".`);
}

function main() {
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: { latest: { type: "string", default: "" } },
    });
    if (positionals.length !== 2) throw new Error(USAGE);
    const [tag, prerelease] = positionals;
    const { version, distTag } = resolveRelease({
      tag,
      prerelease: parseFlag(prerelease),
      latest: values.latest,
    });
    process.stdout.write(`version=${version}\ndist-tag=${distTag}\n`);
  } catch (error) {
    process.stderr.write(`::error::${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
