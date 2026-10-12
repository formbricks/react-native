# Formbricks React Native SDK

[![npm package](https://img.shields.io/npm/v/@formbricks/react-native?style=flat-square)](https://www.npmjs.com/package/@formbricks/react-native)
[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Please see [Formbricks Docs](https://formbricks.com/docs).
Specifically, [Framework Guides](https://formbricks.com/docs/xm-and-surveys/surveys/website-app-surveys/framework-guides).

## What is Formbricks

Formbricks is your go-to solution for in-product micro-surveys that will supercharge your product experience! 🚀 For more information please check out [formbricks.com](https://formbricks.com).

## How to use this library

1. Install the Formbricks package inside your project using npm:

```bash
npm install @formbricks/react-native
```

1. Import Formbricks and initialize the widget in your main component (e.g., App.tsx or App.js):

```javascript
import Formbricks, { track } from "@formbricks/react-native";

export default function App() {
  return (
    <View>
      {/* Your app code */}
      <Formbricks
        appUrl="https://app.formbricks.com"
        workspaceId="your-workspace-id"
      />
    </View>
  );
}
```

Replace your-workspace-id with your actual workspace ID. You can find your workspace ID in the **Connections instructions** in the Formbricks **Configuration** pages.

> **Note:** The `environmentId` prop is still supported as a backward-compatible alias for `workspaceId`, but it is deprecated and will be removed in a future major release. New integrations should use `workspaceId`.

For more detailed guides for different frameworks, check out our [Framework Guides](https://formbricks.com/docs/getting-started/framework-guides).

## Dark mode

Surveys render light by default. Call `setAppearance` to change it:

```ts
import { setAppearance } from "@formbricks/react-native";

setAppearance("dark"); // "light" | "dark" | "system"
```

- Works before or after `setup()`, or pass `appearance` in the `setup()` config.
- An open survey switches in place; the typed answer and current question stay.
- `"system"` follows **your app's** theme (`Appearance.getColorScheme()`, including `Appearance.setColorScheme`), not the phone's, and updates live. If your app keeps its theme only in JS, call `setAppearance("light" | "dark")` yourself when it changes.
- Kept across `logout()`, forgotten on app restart, never sent to the server. An unknown value logs an error and falls back to light.
- Needs a Formbricks server that supports dark mode; an older server keeps surveys light.

Custom CSS configured in Formbricks needs no SDK call; it arrives with the workspace state.
