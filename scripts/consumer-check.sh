#!/usr/bin/env bash
# Packs @formbricks/react-native exactly as `npm publish` ships it, installs the tarball into a
# scratch consumer project, and checks that both the ESM and CJS entry points resolve and type-check.
# Run after `pnpm build`.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_dir="$repo_root/packages/react-native"
typescript_version="$(node -p "require('$package_dir/package.json').devDependencies.typescript")"
types_react_version="$(node -p "require('$package_dir/package.json').devDependencies['@types/react']")"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

echo "Packing @formbricks/react-native"
(cd "$package_dir" && npm pack --silent --pack-destination "$work_dir" >/dev/null)
tarball="$(find "$work_dir" -maxdepth 1 -name '*.tgz' -print -quit)"
tar -tzf "$tarball"

consumer_dir="$work_dir/consumer"
mkdir -p "$consumer_dir"
cd "$consumer_dir"

cat >package.json <<'JSON'
{ "name": "consumer", "private": true, "type": "module" }
JSON

cat >tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": false,
    "types": []
  },
  "files": ["esm.ts", "cjs.cts"]
}
JSON

cat >esm.ts <<'TS'
import Formbricks, {
  type FormbricksProps,
  type TAppearance,
  type TEmbeddedDataInput,
  clearEmbeddedData,
  logout,
  setAppearance,
  setAttribute,
  setAttributes,
  setEmbeddedData,
  setLanguage,
  setUserId,
  track,
} from "@formbricks/react-native";

const props: FormbricksProps = { appUrl: "https://app.formbricks.com", workspaceId: "ws" };
const appearance: TAppearance = "system";
const data: TEmbeddedDataInput = { plan: "pro" };
const pending: Promise<void>[] = [
  setUserId("user"),
  setAttribute("plan", "pro"),
  setAttributes({ seats: 3 }),
  setLanguage("en"),
  track("qa-action"),
  logout(),
];
setAppearance(appearance);
setEmbeddedData(data);
clearEmbeddedData();
export { Formbricks, pending, props };
TS

cat >cjs.cts <<'TS'
import formbricks = require("@formbricks/react-native");

const pending: Promise<void> = formbricks.track("qa-action");
export = { Formbricks: formbricks.Formbricks, default: formbricks.default, pending };
TS

echo "Installing the tarball into a scratch consumer"
# Peer dependencies (react-native, webview, async-storage) are not needed to resolve or type-check
# the public API, so skip them instead of downloading react-native.
npm install --silent --no-audit --no-fund --ignore-scripts --legacy-peer-deps \
  "$tarball" "typescript@$typescript_version" "@types/react@$types_react_version"

echo "Resolving the ESM and CJS entry points"
node --input-type=module -e "console.log(import.meta.resolve('@formbricks/react-native'))"
node --input-type=commonjs -e "console.log(require.resolve('@formbricks/react-native'))"

echo "Type-checking the consumer against the packed types"
npx --no-install tsc -p tsconfig.json

echo "Consumer check passed"
