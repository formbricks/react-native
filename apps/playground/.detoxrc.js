// Detox configuration for the golden journey (e2e/golden-journey.e2e.js). The native projects
// come from `expo prebuild` (plugins/with-detox.js); release builds bundle the JS, so no Metro.
// CI drives it through e2e/react-native/run-journey.sh at the repository root.

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: { $0: "jest", config: "e2e/jest.config.js" },
    jest: { setupTimeout: 300_000 },
  },
  artifacts: {
    rootDir: process.env.DETOX_ARTIFACTS_DIR ?? "e2e/artifacts",
    plugins: {
      log: "failing",
      screenshot: "failing",
      uiHierarchy: "enabled",
    },
  },
  apps: {
    "ios.release": {
      type: "ios.app",
      binaryPath:
        "ios/build/Build/Products/Release-iphonesimulator/FormbricksPlayground.app",
      build:
        "xcodebuild -workspace ios/FormbricksPlayground.xcworkspace -scheme FormbricksPlayground -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build ARCHS=arm64 COMPILER_INDEX_STORE_ENABLE=NO",
    },
    "android.release": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/release/app-release.apk",
      testBinaryPath:
        "android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk",
      // x86_64 only: the CI emulator's ABI, and a quarter of the native build time.
      build: `cd android && ./gradlew --console=plain assembleRelease assembleAndroidTest -DtestBuildType=release -PreactNativeArchitectures=${process.env.DETOX_ANDROID_ABI ?? "x86_64"}`,
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: { type: process.env.DETOX_IOS_DEVICE ?? "iPhone 17" },
    },
    // The emulator the CI step already booted (reactivecircus/android-emulator-runner).
    emulator: {
      type: "android.attached",
      device: { adbName: process.env.DETOX_ADB_NAME ?? "emulator-.*" },
    },
  },
  configurations: {
    "ios.sim.release": { device: "simulator", app: "ios.release" },
    "android.emu.release": { device: "emulator", app: "android.release" },
  },
};
