// Jest runs only the Detox journey; plain CommonJS, so no transform.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: "..",
  testMatch: ["<rootDir>/e2e/**/*.e2e.js"],
  transform: {},
  testTimeout: 600_000,
  maxWorkers: 1,
  globalSetup: "detox/runners/jest/globalSetup",
  globalTeardown: "detox/runners/jest/globalTeardown",
  reporters: ["detox/runners/jest/reporter"],
  testEnvironment: "detox/runners/jest/testEnvironment",
  verbose: true,
};
