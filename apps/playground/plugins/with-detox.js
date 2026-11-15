// Expo config plugin: makes the Android project that `expo prebuild` generates drivable by Detox
// (https://wix.github.io/Detox/docs/introduction/project-setup). iOS needs nothing: Detox injects
// itself into the simulator app at launch.
const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require("expo/config-plugins");

const MARKER = "// @generated with-detox";

const appendOnce = (source, block) =>
  source.includes(MARKER) ? source : `${source}\n${MARKER}\n${block}\n`;

/** android/build.gradle: Detox ships its AAR as a Maven repo inside the npm package. */
const addDetoxMavenRepo = (projectGradle) =>
  appendOnce(
    projectGradle,
    [
      `def detoxMavenPath = new File(["node", "--print", "require.resolve('detox/package.json')"].execute(null, rootDir).text.trim(), "../Detox-android")`,
      "allprojects { repositories { maven { url(detoxMavenPath) } } }",
    ].join("\n"),
  );

const insertAfterOnce = (source, anchor, lines, file) => {
  if (source.includes(lines[0].trim())) return source;
  const index = source.indexOf(anchor);
  if (index === -1) {
    throw new Error(`with-detox: no "${anchor}" in ${file}`);
  }
  const end = index + anchor.length;
  return `${source.slice(0, end)}\n${lines.join("\n")}${source.slice(end)}`;
};

/**
 * android/app/build.gradle: Detox runs through an instrumentation APK. `-DtestBuildType=release`
 * builds that APK against the release app, which bundles the JS (no Metro on CI).
 */
const addDetoxTestRunner = (appGradle) => {
  const file = "android/app/build.gradle";
  const withRunner = insertAfterOnce(
    appGradle,
    "defaultConfig {",
    [
      "        testBuildType System.getProperty('testBuildType', 'debug')",
      "        testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'",
    ],
    file,
  );
  return insertAfterOnce(
    withRunner,
    "dependencies {",
    ["    androidTestImplementation('com.wix:detox:+')"],
    file,
  );
};

/** The instrumentation test that hands control to the Detox test runner on the host. */
const detoxTestClass = (androidPackage) => `package ${androidPackage};

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
    @Rule
    public ActivityTestRule<MainActivity> mActivityRule = new ActivityTestRule<>(MainActivity.class, false, false);

    @Test
    public void runDetoxTests() {
        DetoxConfig detoxConfig = new DetoxConfig();
        detoxConfig.idlePolicyConfig.masterTimeoutSec = 90;
        detoxConfig.idlePolicyConfig.idleResourceTimeoutSec = 60;
        detoxConfig.rnContextLoadTimeoutSec = 180;
        Detox.runTests(mActivityRule, detoxConfig);
    }
}
`;

/**
 * Cleartext for every host: Detox talks to its host server over ws://localhost, and the playground
 * is pointed at plain-http dev servers (the E2E emulator uses http://10.0.2.2:3000). It is a demo
 * app, never shipped.
 */
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

const writeFile = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

const requireGroovy = (modResults, file) => {
  if (modResults.language !== "groovy") {
    throw new Error(`with-detox: ${file} is not Groovy`);
  }
};

const withDetox = (config) => {
  const androidPackage = config.android?.package;
  if (!androidPackage) {
    throw new Error("with-detox: set expo.android.package in app.json");
  }

  config = withProjectBuildGradle(config, (mod) => {
    requireGroovy(mod.modResults, "android/build.gradle");
    mod.modResults.contents = addDetoxMavenRepo(mod.modResults.contents);
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    requireGroovy(mod.modResults, "android/app/build.gradle");
    mod.modResults.contents = addDetoxTestRunner(mod.modResults.contents);
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      mod.modResults,
    );
    application.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";
    return mod;
  });

  return withDangerousMod(config, [
    "android",
    (mod) => {
      const appDir = path.join(mod.modRequest.platformProjectRoot, "app/src");
      writeFile(
        path.join(appDir, "main/res/xml/network_security_config.xml"),
        NETWORK_SECURITY_CONFIG,
      );
      writeFile(
        path.join(
          appDir,
          "androidTest/java",
          ...androidPackage.split("."),
          "DetoxTest.java",
        ),
        detoxTestClass(androidPackage),
      );
      return mod;
    },
  ]);
};

module.exports = withDetox;
module.exports.addDetoxMavenRepo = addDetoxMavenRepo;
module.exports.addDetoxTestRunner = addDetoxTestRunner;
