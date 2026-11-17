// Reads the npm registry for the release workflow.
//
//   node scripts/release/npm-registry.mjs exists <package> <version>
//     Prints `exists=true|false` (a GitHub step output). Fails if the registry errors,
//     so the publish step never guesses.
//
//   node scripts/release/npm-registry.mjs latest <package>
//     Prints `latest=<version>` (empty when nothing is on `latest` yet), the input to
//     resolve-release.mjs --latest. Fails if the registry errors.
//
//   node scripts/release/npm-registry.mjs verify <package> <version> <dist-tag>
//       [--timeout-seconds 600] [--interval-seconds 15] [--already-published]
//     Polls until <version> is published and <dist-tag> points at it, or at a newer version on
//     the same channel (so re-running an old release stays green). Fails after the timeout.
//     --already-published says the version was on npm before this run (its publish was skipped):
//     a release-line <dist-tag> then also accepts a newer `latest`, because the version may have
//     shipped on `latest` before a newer line superseded it.
//
// All accept --registry <url> (default https://registry.npmjs.org).

import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  compareVersions,
  parseVersion,
  releaseLineTag,
} from "./resolve-release.mjs";

const USAGE =
  "Usage: npm-registry.mjs exists <package> <version> | latest <package> | verify <package> <version> <dist-tag> [--timeout-seconds N] [--interval-seconds N] [--already-published] [--registry URL]";

// Returns the package document, or null when the registry has never seen the package.
async function fetchPackument(registry, name) {
  // Escape the whole name (a scoped name's slash becomes %2F), keeping the leading @ the
  // registry expects.
  const escapedName = encodeURIComponent(name).replace(/^%40/, "@");
  const url = `${registry.replace(/\/$/, "")}/${escapedName}`;
  const response = await fetch(url, {
    headers: {
      // The abbreviated document holds `versions` and `dist-tags`, which is all we read.
      accept: "application/vnd.npm.install-v1+json",
      "cache-control": "no-cache",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET ${url} returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function exists({ registry, name, version }) {
  const packument = await fetchPackument(registry, name);
  const found = Object.hasOwn(packument?.versions ?? {}, version);
  process.stdout.write(`exists=${found}\n`);
}

async function latest({ registry, name }) {
  const packument = await fetchPackument(registry, name);
  process.stdout.write(`latest=${packument?.["dist-tags"]?.latest ?? ""}\n`);
}

// Whether `candidate` belongs on the channel `distTag` names: `next` holds prereleases,
// `latest` stable versions, and `release-X.Y` stable X.Y.* backports.
function isOnChannel(candidate, distTag) {
  const parsed = parseVersion(candidate ?? "");
  if (!parsed) return false;
  if (distTag === "next") return parsed.prerelease.length > 0;
  if (parsed.prerelease.length > 0) return false;
  return distTag === "latest" || distTag === releaseLineTag(parsed);
}

// The version `distTag` points at, when that version is `version` or a newer one on the same
// channel. A `release-X.Y` tag also accepts `latest` when the tag does not exist yet, or when
// `version` was already published: `version` then shipped on `latest` and a newer line has
// superseded it since, which resolve-release now reports as a backport.
function servingVersion(distTags, version, distTag, alreadyPublished) {
  const channels = [distTag];
  if (
    distTag.startsWith("release-") &&
    (alreadyPublished || !Object.hasOwn(distTags, distTag))
  ) {
    channels.push("latest");
  }
  for (const channel of channels) {
    const current = distTags[channel];
    if (current === version) return current;
    if (
      isOnChannel(current, channel) &&
      compareVersions(current, version) > 0
    ) {
      return current;
    }
  }
  return null;
}

async function verify({
  registry,
  name,
  version,
  distTag,
  timeoutSeconds,
  intervalSeconds,
  alreadyPublished,
}) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let current;
  for (;;) {
    let status;
    try {
      const packument = await fetchPackument(registry, name);
      const distTags = packument?.["dist-tags"] ?? {};
      current = distTags[distTag];
      const published = Object.hasOwn(packument?.versions ?? {}, version);
      const serving =
        published &&
        servingVersion(distTags, version, distTag, alreadyPublished);
      if (serving) {
        const note =
          serving === version ? "" : ` (now at the newer ${serving})`;
        process.stdout.write(
          `${name}@${version} is live on the "${distTag}" dist-tag${note}.\n`,
        );
        return;
      }
      status = published
        ? `"${distTag}" points at ${current ?? "nothing"}`
        : `${version} is not published yet`;
    } catch (error) {
      // The registry CDN has hiccups; keep polling until the deadline.
      status = error.message;
    }
    if (Date.now() + intervalSeconds * 1000 > deadline) break;
    process.stdout.write(`${status}; waiting for ${version}...\n`);
    await setTimeout(intervalSeconds * 1000);
  }
  throw new Error(
    `${name}@${version} did not appear on the "${distTag}" dist-tag within ${timeoutSeconds}s (it points at ${current ?? "nothing"}).`,
  );
}

function parseSeconds(name, value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`--${name} must be a positive number. ${USAGE}`);
  }
  return seconds;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      registry: { type: "string", default: "https://registry.npmjs.org" },
      "timeout-seconds": { type: "string", default: "600" },
      "interval-seconds": { type: "string", default: "15" },
      "already-published": { type: "boolean", default: false },
    },
  });
  const [command, name, version, distTag] = positionals;
  const { registry } = values;

  if (command === "exists" && positionals.length === 3) {
    return exists({ registry, name, version });
  }
  if (command === "latest" && positionals.length === 2) {
    return latest({ registry, name });
  }
  if (command === "verify" && positionals.length === 4) {
    return verify({
      registry,
      name,
      version,
      distTag,
      timeoutSeconds: parseSeconds(
        "timeout-seconds",
        values["timeout-seconds"],
      ),
      intervalSeconds: parseSeconds(
        "interval-seconds",
        values["interval-seconds"],
      ),
      alreadyPublished: values["already-published"],
    });
  }
  throw new Error(USAGE);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`::error::${error.message}\n`);
  process.exitCode = 1;
}
