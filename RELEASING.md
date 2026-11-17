# Releasing `@formbricks/react-native`

Publishing a GitHub release publishes the SDK to npm. The tag is the version: there is no
version-bump PR, and `packages/react-native/package.json` on `main` keeps the placeholder
`0.0.0-dev`.

The cross-SDK runbook, with the manual QA how-to and the golden journey, is the Notion doc
"SDK QA & Release": https://app.notion.com/p/419e5de84a5881cd8091c30193db8607.

## What happens when you publish a release

`.github/workflows/release.yml` runs on `release: published`. Every job checks out the tag
commit, so the release scripts come from the tag, not from `main`. It does three jobs:

1. **Build** reads the tag, checks that it is plain semver and that it agrees with the GitHub
   "pre-release" box, and picks the npm dist-tag (see the table). It writes the version into
   `packages/react-native/package.json` on the runner only, then builds and packs the SDK.
2. **Publish** reads npm again and picks the dist-tag from what is there now, so a re-run never
   moves `latest` back to an older version. It publishes the tarball with npm trusted publishing
   (OIDC, no token). If the version is already on npm, it skips the publish, so re-running is
   always safe.
3. **Verify** polls npm until the version is published and its dist-tag points at it, or at a
   newer version on the same channel (so re-running an old release stays green). It fails after
   10 minutes.

Release runs never overlap: a second release waits for the first to finish. GitHub keeps only
one waiting run, so publishing a third release while one runs and one waits cancels the waiting
one. Re-run the cancelled run once the others are done.

| Tag             | GitHub "Set as a pre-release" | npm dist-tag                                     |
| --------------- | ----------------------------- | ------------------------------------------------ |
| `3.4.0`         | unticked                      | `latest`, if 3.4.0 ≥ the current `latest`        |
| `3.3.2`         | unticked                      | `release-3.3`, if 3.3.2 < the current `latest`   |
| `3.4.0-rc.1`    | ticked                        | `next`                                           |
| `3.4.0-beta.2`  | ticked                        | `next`                                           |

The tag is plain semver: a `v` prefix (`v3.4.0`) and build metadata (`+build.1`) are rejected. A
tag and box that disagree fail the build job before anything is published. A backport never moves
`latest`.

The release workflow does not run lint or tests: CI already ran on `main`. Nothing checks that QA
ran, so run it before you release.

## Cut a release

1. Make sure CI on `main` is green.
2. Run QA: Actions → **E2E** (`.github/workflows/e2e.yml`) → **Run workflow** on `main`, with
   `server_version` set to the Formbricks image you release against (default `latest`). See the
   Notion doc for what to check.
3. Releases → **Draft a new release**.
4. Choose a tag: create `X.Y.Z` (no `v`) on `main`.
5. Click **Generate release notes**. They come from the semantic PR titles. Edit if needed.
6. Leave **Set as a pre-release** unticked and tick **Set as the latest release**.
7. **Publish release**, then watch the **Release React Native SDK** run until `Verify on npm` is green.

## Cut a prerelease

Same as above, with two differences:

- Tag `X.Y.Z-rc.N` (or `-beta.N`, `-alpha.N`).
- Tick **Set as a pre-release**.

It publishes to the `next` dist-tag, so `npm install @formbricks/react-native` keeps resolving to the last
stable version. Testers install it with `npm install @formbricks/react-native@next`, or pin the exact version.

To ship the final version, cut a new stable release (`X.Y.Z`). A prerelease is never moved to
`latest`.

## Cut a backport

A stable version older than the current `latest` (for example `3.3.2` while `latest` is `3.4.0`)
publishes to the `release-3.3` dist-tag and leaves `latest` alone. Users install it with
`npm install @formbricks/react-native@release-3.3`, or pin the exact version.

Same steps as a release, with two differences:

- Create the tag `X.Y.Z` on the release branch you backported to, not on `main`, and run QA on
  that branch.
- Untick **Set as the latest release**.

## Recover from a failure

Never delete a tag, and never unpublish from npm. "Re-run" replays the original release event,
so editing the release afterwards does not change what a re-run does.

| What failed                                        | What to do                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build: tag is not semver                           | Delete the GitHub release (not the tag). Publish a new release on a correct tag.                                                                                                                 |
| Build: tag and "pre-release" box disagree          | Delete the GitHub release (not the tag). Create a release again on the same tag with the box set correctly.                                                                                      |
| Build: install, build or pack failed               | If it was flaky, **Re-run failed jobs**. If the code is broken, fix it on `main` and release the next patch version.                                                                             |
| Publish failed                                     | **Re-run failed jobs**. If the version reached npm before the failure, the publish step is skipped.                                                                                              |
| Verify timed out                                   | Run `npm view @formbricks/react-native dist-tags`. If the version is there now, re-run the failed job. If the dist-tag points elsewhere, a maintainer runs `npm dist-tag add @formbricks/react-native@X.Y.Z <tag>`. |
| A bad version shipped                              | Release a fixed patch version. If needed, point `latest` back with `npm dist-tag add @formbricks/react-native@<good> latest` and `npm deprecate @formbricks/react-native@<bad> "<reason>"`.                          |

## Maintaining the workflow

- npm trusted publishing is bound to the file name `release.yml`. Renaming it breaks publishing
  until the trusted publisher on npmjs.com is updated.
- The release logic lives in `scripts/release/` and has tests. Run them with `pnpm test:scripts`;
  CI runs them in `unit-tests`.
- The workflow runs the scripts from the tag, so a fix to them ships with the next tag.
- Tags are plain versions (`3.3.1`). The one exception is `v2.2.0`, the tag of the 2.2.0 release
  (there is no `2.2.0` tag). It stays, because tags are never deleted and it backs a published
  GitHub release.
