const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls `attempt` until it stops throwing and returns its result. The survey renders, animates
 * and talks to the server asynchronously, and Detox's own waiting is off (see the journey), so
 * every check in the journey goes through here. `isFatal` marks errors that waiting cannot fix
 * (the app is gone), so they fail the attempt at once instead of at the timeout.
 */
const poll = async (
  attempt,
  {
    what,
    timeoutMs,
    intervalMs = 500,
    isFatal = () => false,
    now = Date.now,
    sleep = realSleep,
  },
) => {
  const start = now();
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (isFatal(error)) throw error;
      if (now() - start >= timeoutMs) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Timed out after ${timeoutMs / 1000}s waiting for ${what}: ${reason}`,
          { cause: error },
        );
      }
      await sleep(intervalMs);
    }
  }
};

module.exports = { poll };
