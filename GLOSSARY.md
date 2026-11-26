# Glossary

Terms the React Native SDK (`packages/react-native`) uses, grouped by area. Use these words in issues, code and tests; the `/domain-modeling` skill adds new ones as they get resolved.

## Setup and configuration

- **Workspace**: the Formbricks space the app's surveys, action classes and styling belong to, identified by `workspaceId` (`TWorkspace`, `src/lib/workspace/`). Replaces the older term _environment_: `environmentId` is a deprecated alias that still works, and stored configs that use it are migrated.
- **App URL**: the Formbricks instance the SDK talks to (`appUrl`), passed to `setup()` with the workspace ID.
- **Config**: the SDK's persisted state (`TConfig`, `RNConfig`): workspace ID, app URL, workspace state, user state and filtered surveys, stored in AsyncStorage.
- **Workspace state**: the workspace's surveys, action classes and settings as fetched from the server, cached with an expiry (30 minutes) and refetched when it lapses.

## Users

- **User ID**: the app's identifier for the signed-in user, set with `setUserId()`. Without one the user is anonymous; `logout()` clears it.
- **Attributes**: key/value facts about the user (`setAttribute()`, `setAttributes()`, `setLanguage()`), sent to the server and used for targeting.
- **User state**: what the server knows about the user (`TUserState`): user ID, segments, displays, responses, last display time and language.
- **Segment**: a server-defined group of users; the SDK only receives the IDs of the segments a user belongs to and never evaluates segment filters itself.
- **Interaction refresh**: refetching a user's segments after a survey display, response or finish, gated per survey by `interactionRefresh` (`src/lib/user/interaction-refresh.ts`).

## Surveys

- **Action**: a named event the app reports with `track(name)`; it can trigger a survey.
- **Action class**: the workspace's definition of an action (`TActionClass`), either `code` (tracked from the app) or `noCode`.
- **Trigger**: an action class a survey listens for (`survey.triggers`).
- **Display option**: how often a survey may show to one user (`displayOnce`, `displayMultiple`, `displaySome`, `respondMultiple`).
- **Filtered surveys**: the surveys this user is eligible for after display options, recontact days and segments are applied (`filterSurveys`).
- **Display**: one time a survey was shown to a user.
- **Response**: a user's answers to a survey.
- **Embedded Data**: app context attached to future responses with `setEmbeddedData()` / `clearEmbeddedData()`. Held in memory, synchronous and never queued; values land only on fields the survey declares as ingested.
- **Survey web view**: the WebView that renders a survey with the Formbricks renderer (`src/components/survey-web-view.tsx`), mounted by the `<Formbricks />` component.
- **Appearance**: how surveys render, `light`, `dark` or `system` (`setAppearance()`); kept in memory only, never sent to the server.

## Internals

- **Command queue**: runs the public async methods (`track`, `setUserId`, `setAttributes`, `logout`, …) one at a time, in order (`CommandQueue`).
- **Update queue**: debounces user ID and attribute updates into one request to the server (`UpdateQueue`).
