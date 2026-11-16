# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace with two main packages:

- `packages/react-native`: the published SDK (`@formbricks/react-native`). Source lives in `src/`, grouped by domain under `src/lib/`, with React components in `src/components/` and shared types in `src/types/`.
- `apps/playground`: an Expo app for manual testing and integration checks. App code is in `src/`, with static assets in `assets/`.

GitHub Actions run every check from `.github/workflows/ci.yml`; its `PR Check Summary` job is the only required check. `release.yml` publishes.

## Build, Test, and Development Commands
Run commands from the repository root unless package-scoped work is needed.

- `pnpm install --frozen-lockfile`: install workspace dependencies.
- `pnpm dev`: run Turbo watchers across packages.
- `pnpm build`: build the SDK and playground.
- `pnpm lint`: enforce exact dependency versions, then run Biome lint (warnings fail).
- `pnpm format` / `pnpm format:check`: format with Biome, or only check formatting.
- `pnpm check-types`: run TypeScript checks across the workspace.
- `pnpm test`: run unit tests with Vitest.
- `pnpm test:coverage`: generate coverage reports for SonarQube.
- `pnpm test:scripts`: test the CI and release helper scripts under `scripts/`.
- `pnpm api:check`: compare the public API with `packages/react-native/etc/react-native.api.md` (api-extractor in check mode); CI's `api-check` runs it.
- `pnpm api:update`: regenerate `packages/react-native/etc/react-native.api.md`. Commit it whenever the public API changes.
- `pnpm package-check`: after a build, run publint, attw, and install the `npm pack` tarball into a scratch consumer.
- `pnpm --filter playground ios` / `pnpm --filter playground android`: launch the Expo playground on a device target.

## Coding Style & Naming Conventions
Use TypeScript with strict compiler settings. Biome is the formatter and linter; run `pnpm format` before large refactors. The repo uses spaces for indentation, double quotes, and semicolons.

Follow existing naming patterns: React components in lowercase kebab-style filenames such as `survey-web-view.tsx`, domain modules in concise lowercase names such as `state.ts`, and tests as `*.test.ts`. Keep imports using the `@/` alias inside `packages/react-native` when referencing `src/`.

## Testing Guidelines
Unit tests live beside each domain under `src/lib/**/tests/`. Prefer small, focused Vitest suites and place reusable doubles in local `__mocks__/` folders. Add or update tests with every behavior change; there is no published coverage threshold, but `test:coverage` is part of the release workflow, so changed code should stay covered.

## Commit & Pull Request Guidelines
Recent history mostly follows Conventional Commit-style subjects such as `feat:`, `fix:`, and `chore:` with short imperative summaries. Keep commits narrowly scoped and descriptive.

PRs should include a clear summary, linked issue if applicable, and the commands you ran locally (`pnpm lint`, `pnpm check-types`, relevant tests). Include screenshots or screen recordings when a playground or UI behavior changes. Avoid loose dependency ranges: this repo enforces exact versions in every `package.json`.
