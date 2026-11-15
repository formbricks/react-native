const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { poll } = require("./poll");

/** A clock that only moves when the code under test sleeps. */
const fakeClock = () => {
  let time = 0;
  const sleeps = [];
  return {
    now: () => time,
    sleep: async (ms) => {
      sleeps.push(ms);
      time += ms;
    },
    sleeps,
  };
};

describe("poll", () => {
  it("returns the first result that does not throw", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await poll(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error(`not yet ${calls}`);
        return "survey open";
      },
      { what: "the survey", timeoutMs: 10_000, intervalMs: 500, ...clock },
    );
    assert.equal(result, "survey open");
    assert.equal(calls, 3);
    assert.deepEqual(clock.sleeps, [500, 500]);
  });

  it("gives up after the timeout, naming what it waited for and the last failure", async () => {
    const clock = fakeClock();
    let calls = 0;
    await assert.rejects(
      poll(
        async () => {
          calls += 1;
          throw new Error(`no web view (${calls})`);
        },
        { what: "the survey", timeoutMs: 2_000, intervalMs: 500, ...clock },
      ),
      (error) => {
        assert.equal(
          error.message,
          "Timed out after 2s waiting for the survey: no web view (5)",
        );
        assert.equal(error.cause.message, "no web view (5)");
        return true;
      },
    );
    assert.equal(calls, 5);
  });
});
