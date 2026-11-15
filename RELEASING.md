# Releasing `@formbricks/react-native`

Publishing a GitHub release ships the SDK to npm. There is no version-bump PR:
the version comes from the release tag. `packages/react-native/package.json` on
`main` always holds the placeholder `0.0.0-dev`.

The team-wide QA and release runbook is in Notion: <!-- NOTION_SDK_QA_RELEASE_URL -->

## Before you release

Run the manual QA: start the E2E workflow (`workflow_dispatch`) on `main` with
`server_version` set to the Formbricks server you are releasing against, and wait
for it to pass. Nothing in the release workflow checks that this happened.

## Cut a release

1. On GitHub, draft a new release from `main`.
2. Create a new tag that is a bare semver version, with no `v` prefix:
   - stable: `3.4.0`
   - prerelease: `3.4.0-rc.1`, `3.4.0-beta.2`
3. Tick **Set as a pre-release** if and only if the tag has a prerelease suffix.
   The workflow fails before building if the two disagree.
4. Generate the release notes. They are the changelog, built from the semantic
   PR titles.
5. Publish the release.

| Release     | npm dist-tag | Install with                          |
| ----------- | ------------ | ------------------------------------- |
| stable      | `latest`     | `npm i @formbricks/react-native`      |
| pre-release | `next`       | `npm i @formbricks/react-native@next` |

## What the workflow does

`.github/workflows/release.yml` runs on `release: published`, in three jobs:

1. **Build**: checks out the tag, runs `scripts/release/resolve-release.mjs` to
   validate the tag and write its version into `package.json` (in the runner
   only, nothing is committed), then builds and packs the tarball.
2. **Publish**: skips if the version is already on npm, otherwise runs
   `npm publish --tag <latest|next>` with npm trusted publishing (OIDC), which
   also attaches provenance. Only this job gets `id-token: write`.
3. **Verify**: polls the registry until the version is on its dist-tag, and
   fails after 10 minutes.

The release does not re-run lint or tests: CI already ran them on `main`.

## When something fails

- **Re-run failed jobs** is always safe. Publish skips a version that is already
  on npm, and verify only reads the registry.
- **Wrong tag or wrong pre-release box**: the build fails before anything is
  published. Publish a new release with a correct tag. Re-running won't help,
  because a re-run reuses the original release event.
- **Never delete or move a tag.** npm never accepts the same version twice, so
  ship a fix as the next version.
- **Verify timed out** but `npm view @formbricks/react-native dist-tags` shows the
  version: the registry was slow. Re-run the verify job.

## Things to know

- Trusted publishing on npmjs.com is bound to this repository and to the file
  name `release.yml`. Renaming the workflow breaks publishing until the npm
  package settings are updated.
- A stable release always moves `latest`. Releasing a patch for an older line
  (say `3.2.1` after `3.3.0`) would point `latest` back at it. A maintainer can
  restore it with `npm dist-tag add @formbricks/react-native@<newest> latest`.
- Tags are bare versions (`3.3.1`). The one exception is `v2.2.0`, the tag of
  the 2.2.0 release (there is no `2.2.0` tag). It stays, because tags are never
  deleted and it backs a published GitHub release. The workflow now rejects
  `v`-prefixed tags.
- The release scripts have their own tests: `node --test 'scripts/release/*.test.mjs'`.
