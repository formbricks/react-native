#!/usr/bin/env bash
# Builds and runs the Detox golden journey (apps/playground/e2e) on one platform.
#   e2e/react-native/run-journey.sh android build   expo prebuild + release APK and test APK
#   e2e/react-native/run-journey.sh android test    run on the booted emulator (adb sees it)
#   e2e/react-native/run-journey.sh ios build       expo prebuild + pods + release simulator app
#   e2e/react-native/run-journey.sh ios test        run on an iPhone simulator Detox boots
# Env for `test`: E2E_USER_ID and E2E_FEEDBACK (the values assert-response.sh checks), E2E_APP_URL
# (default on Android: http://10.0.2.2:3000, the emulator's view of the host; required on iOS,
# where it is the tunnel URL), optional E2E_WORKSPACE_ID.
# A failed journey is retried once inside the step (`detox test --retries 1`): the merge queue
# drops a PR before anyone could re-run the job. Detox artifacts (logs and screenshots of failing
# attempts, UI hierarchy) land in e2e/react-native/artifacts.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
playground="${root}/apps/playground"
platform="${1:-}"
command="${2:-}"

case "${platform}" in
  android) configuration=android.emu.release ;;
  ios) configuration=ios.sim.release ;;
  *)
    echo "usage: $0 android|ios build|test" >&2
    exit 2
    ;;
esac

cd "${playground}"
export DETOX_ARTIFACTS_DIR="${root}/e2e/react-native/artifacts"

case "${command}" in
  build)
    # The playground consumes the SDK's build output (dist/), not its sources.
    echo "==> Building @formbricks/react-native" >&2
    pnpm --dir "${root}" --filter @formbricks/react-native build
    echo "==> Generating the ${platform} project (expo prebuild)" >&2
    pnpm exec expo prebuild --platform "${platform}" --no-install --clean
    if [[ "${platform}" == ios ]]; then
      (cd ios && LANG=en_US.UTF-8 pod install)
      # pnpm does not run detox's postinstall, which builds the framework Detox injects into the app.
      pnpm exec detox build-framework-cache
    fi
    echo "==> Building the ${platform} playground and its Detox runner" >&2
    pnpm exec detox build --configuration "${configuration}"
    ;;
  test)
    if [[ "${platform}" == android ]]; then
      export E2E_APP_URL="${E2E_APP_URL:-http://10.0.2.2:3000}"
      # Detox keeps only the app's own log; the full logcat shows crashes and WebView errors.
      trap 'mkdir -p "${DETOX_ARTIFACTS_DIR}" && adb logcat -d -v threadtime >"${DETOX_ARTIFACTS_DIR}/logcat.txt" 2>&1 || true' EXIT
    fi
    : "${E2E_APP_URL:?set E2E_APP_URL to the server URL the app can reach}"
    : "${E2E_USER_ID:?set E2E_USER_ID to the userId the journey identifies as}"
    : "${E2E_FEEDBACK:?set E2E_FEEDBACK to the open-text answer the journey types}"
    echo "==> Running the golden journey on ${platform} against ${E2E_APP_URL}" >&2
    pnpm exec detox test --configuration "${configuration}" --retries 1 --cleanup
    ;;
  *)
    echo "usage: $0 android|ios build|test" >&2
    exit 2
    ;;
esac
