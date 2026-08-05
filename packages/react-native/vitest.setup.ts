import { afterEach, beforeEach, vi } from "vitest";

// React Native injects `__DEV__` at build time; modules that branch on it need it defined here.
vi.stubGlobal("__DEV__", false);

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// Mock react-native
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// Mock react-native-webview
vi.mock("react-native-webview", () => ({
  WebView: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
