import { resolve } from "node:path";
import { defineConfig } from "vite";
import type { ViteUserConfig } from "vitest/config";

const config = (): ViteUserConfig => {
  return defineConfig({
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    optimizeDeps: {
      exclude: ["react-native"],
    },
    build: {
      emptyOutDir: false,
      rollupOptions: {
        external: [
          "react",
          "react-native",
          "react-dom",
          "react-native-webview",
          "@react-native-async-storage/async-storage",
          "@react-native-community/netinfo",
        ],
        output: {
          exports: "named",
        },
      },
      lib: {
        entry: resolve(__dirname, "src/index.ts"),
        name: "formbricksReactNative",
        formats: ["es", "cjs"],
        fileName: "index",
      },
    },
    test: {
      setupFiles: ["./vitest.setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html", "lcov"],
        include: ["src/**/*.ts"],
        exclude: ["src/types/**/*.ts"],
      },
    },
  });
};

export default config;
