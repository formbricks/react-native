import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isVersionPublished, waitForDistTag } from "./npm-registry.mjs";

const NAME = "@formbricks/react-native";

// Stands in for the npm registry: answers the packument request for NAME with
// whatever document the test sets, and records the URLs it was asked for.
function fakeRegistry(documents) {
  const queue = [...documents];
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    const doc = queue.length > 1 ? queue.shift() : queue[0];
    if (doc === 404) return new Response("Not found", { status: 404 });
    if (doc === 503) return new Response("Unavailable", { status: 503 });
    return Response.json(doc);
  };
  return { fetch, requests };
}

// A clock that only moves when the code under test sleeps.
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
}

describe("isVersionPublished", () => {
  it("is true when the registry already has the version", async () => {
    const registry = fakeRegistry([
      { "dist-tags": { latest: "3.3.1" }, versions: { "3.3.1": {} } },
    ]);

    assert.equal(
      await isVersionPublished({
        name: NAME,
        version: "3.3.1",
        fetch: registry.fetch,
      }),
      true,
    );
    assert.deepEqual(registry.requests, [
      "https://registry.npmjs.org/@formbricks%2freact-native",
    ]);
  });

  it("requests an unscoped package by its bare name", async () => {
    const registry = fakeRegistry([{ "dist-tags": {}, versions: {} }]);

    await isVersionPublished({
      name: "left-pad",
      version: "1.0.0",
      fetch: registry.fetch,
    });

    assert.deepEqual(registry.requests, [
      "https://registry.npmjs.org/left-pad",
    ]);
  });

  it("rejects a name that is not a valid npm package name, without a request", async () => {
    for (const name of [
      "@formbricks/react-native/extra",
      "../../-/user",
      "@scope/",
      "a b",
    ]) {
      const registry = fakeRegistry([{ "dist-tags": {}, versions: {} }]);

      await assert.rejects(
        isVersionPublished({ name, version: "1.0.0", fetch: registry.fetch }),
        /not a valid npm package name/,
      );
      assert.deepEqual(registry.requests, []);
    }
  });

  it("is false when the registry does not have the version yet", async () => {
    const registry = fakeRegistry([
      { "dist-tags": { latest: "3.3.1" }, versions: { "3.3.1": {} } },
    ]);

    assert.equal(
      await isVersionPublished({
        name: NAME,
        version: "3.4.0",
        fetch: registry.fetch,
      }),
      false,
    );
  });

  it("is false when the package has never been published", async () => {
    const registry = fakeRegistry([404]);

    assert.equal(
      await isVersionPublished({
        name: NAME,
        version: "3.4.0",
        fetch: registry.fetch,
      }),
      false,
    );
  });

  it("throws when the registry cannot be read", async () => {
    const registry = fakeRegistry([503]);

    await assert.rejects(
      isVersionPublished({
        name: NAME,
        version: "3.4.0",
        fetch: registry.fetch,
      }),
      /registry returned HTTP 503/,
    );
  });
});

describe("waitForDistTag", () => {
  it("polls until the dist-tag points at the version", async () => {
    const registry = fakeRegistry([
      { "dist-tags": { latest: "3.3.1" }, versions: { "3.3.1": {} } },
      {
        "dist-tags": { latest: "3.3.1" },
        versions: { "3.3.1": {}, "3.4.0": {} },
      },
      {
        "dist-tags": { latest: "3.4.0" },
        versions: { "3.3.1": {}, "3.4.0": {} },
      },
    ]);

    await waitForDistTag({
      name: NAME,
      version: "3.4.0",
      distTag: "latest",
      timeoutMs: 60_000,
      intervalMs: 10_000,
      fetch: registry.fetch,
      ...fakeClock(),
    });

    assert.equal(registry.requests.length, 3);
  });

  it("fails after the timeout, naming what the dist-tag points at", async () => {
    const registry = fakeRegistry([
      {
        "dist-tags": { latest: "3.3.1", next: "3.4.0-rc.1" },
        versions: { "3.3.1": {}, "3.4.0-rc.1": {} },
      },
    ]);

    await assert.rejects(
      waitForDistTag({
        name: NAME,
        version: "3.4.0-rc.1",
        distTag: "latest",
        timeoutMs: 60_000,
        intervalMs: 10_000,
        fetch: registry.fetch,
        ...fakeClock(),
      }),
      /@formbricks\/react-native@3\.4\.0-rc\.1 is not on dist-tag "latest" after 60s \(it points at 3\.3\.1\)/,
    );
    assert.equal(registry.requests.length, 7);
  });
});
