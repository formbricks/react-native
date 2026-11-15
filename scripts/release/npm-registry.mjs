import { appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const REGISTRY = "https://registry.npmjs.org";

async function fetchPackument(name, fetch) {
  const url = `${REGISTRY}/${name.replace("/", "%2f")}`;
  const response = await fetch(url);
  if (response.status === 404) return { "dist-tags": {}, versions: {} };
  if (!response.ok) {
    throw new Error(`${url}: registry returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function isVersionPublished({ name, version, fetch }) {
  const packument = await fetchPackument(name, fetch);
  return Object.hasOwn(packument.versions, version);
}

export async function waitForDistTag({
  name,
  version,
  distTag,
  timeoutMs,
  intervalMs,
  fetch,
  sleep,
  now,
}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const packument = await fetchPackument(name, fetch);
    const current = packument["dist-tags"][distTag];
    if (current === version) return;
    if (now() >= deadline) {
      throw new Error(
        `${name}@${version} is not on dist-tag "${distTag}" after ${timeoutMs / 1000}s (it points at ${current ?? "nothing"}).`,
      );
    }
    await sleep(intervalMs);
  }
}

// CLI, configured through PACKAGE_NAME, VERSION and (for verify) DIST_TAG and
// TIMEOUT_SECONDS:
//   published  writes published=true|false to $GITHUB_OUTPUT
//   verify     polls until VERSION is live on DIST_TAG, fails after the timeout
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PACKAGE_NAME, VERSION, DIST_TAG, TIMEOUT_SECONDS, GITHUB_OUTPUT } =
    process.env;
  const command = process.argv[2];
  try {
    if (command === "published") {
      const published = await isVersionPublished({
        name: PACKAGE_NAME,
        version: VERSION,
        fetch,
      });
      appendFileSync(GITHUB_OUTPUT, `published=${published}\n`);
      console.log(
        published
          ? `${PACKAGE_NAME}@${VERSION} is already on npm; skipping publish.`
          : `${PACKAGE_NAME}@${VERSION} is not on npm yet.`,
      );
    } else if (command === "verify") {
      await waitForDistTag({
        name: PACKAGE_NAME,
        version: VERSION,
        distTag: DIST_TAG,
        timeoutMs: Number(TIMEOUT_SECONDS ?? 600) * 1000,
        intervalMs: 15_000,
        fetch: (url) =>
          fetch(url, { headers: { "Cache-Control": "no-cache" } }),
        sleep,
        now: Date.now,
      });
      console.log(
        `${PACKAGE_NAME}@${VERSION} is live on dist-tag "${DIST_TAG}".`,
      );
    } else {
      throw new Error(
        `Unknown command "${command}". Use "published" or "verify".`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
