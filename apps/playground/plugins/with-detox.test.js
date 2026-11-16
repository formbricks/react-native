const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { addDetoxMavenRepo, addDetoxTestRunner } = require("./with-detox");

// Trimmed from the android/build.gradle that `expo prebuild` generates (SDK 55).
const projectGradle = `allprojects {
  repositories {
    google()
    mavenCentral()
  }
}

apply plugin: "expo-root-project"
`;

const count = (text, needle) => text.split(needle).length - 1;

describe("addDetoxMavenRepo", () => {
  it("adds the Maven repo bundled in the detox npm package to every project", () => {
    const result = addDetoxMavenRepo(projectGradle);
    assert.ok(result.startsWith(projectGradle));
    assert.ok(
      result.includes(
        `def detoxMavenPath = new File(["node", "--print", "require.resolve('detox/package.json')"].execute(null, rootDir).text.trim(), "../Detox-android")`,
      ),
    );
    // Exclusive: other repos (jitpack) answer com.wix lookups with HTML and break the build.
    assert.ok(
      result.includes(
        'allprojects { repositories { exclusiveContent { forRepository { maven { url(detoxMavenPath) } }; filter { includeGroup("com.wix") } } } }',
      ),
    );
  });

  it("adds it once when prebuild runs again", () => {
    const once = addDetoxMavenRepo(projectGradle);
    assert.equal(addDetoxMavenRepo(once), once);
    assert.equal(count(once, "detoxMavenPath)"), 1);
  });
});

// Trimmed from the android/app/build.gradle that `expo prebuild` generates (SDK 55).
const appGradle = `android {
    namespace 'com.formbricks.playground'
    defaultConfig {
        applicationId 'com.formbricks.playground'
        versionCode 1
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`;

describe("addDetoxTestRunner", () => {
  it("builds the instrumentation APK against the build type Detox asks for", () => {
    const result = addDetoxTestRunner(appGradle);
    assert.match(
      result,
      /defaultConfig \{\n {8}testBuildType System\.getProperty\('testBuildType', 'debug'\)\n {8}testInstrumentationRunner 'androidx\.test\.runner\.AndroidJUnitRunner'\n {8}applicationId/,
    );
  });

  it("adds Detox to the instrumentation test dependencies", () => {
    assert.match(
      addDetoxTestRunner(appGradle),
      /dependencies \{\n {4}androidTestImplementation\('com\.wix:detox:\+'\)\n {4}implementation/,
    );
  });

  it("changes nothing when prebuild runs again", () => {
    const once = addDetoxTestRunner(appGradle);
    assert.equal(addDetoxTestRunner(once), once);
  });

  it("fails loudly when the template no longer has the blocks it edits", () => {
    assert.throws(
      () => addDetoxTestRunner("android {\n}\n"),
      /with-detox: no "defaultConfig \{" in android\/app\/build\.gradle/,
    );
  });
});
