import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
];
const ignoredDirs = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules",
]);
const exactVersionPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

const manifestPaths = [];
collectPackageJsonPaths(rootDir, manifestPaths);

const violations = [];
for (const manifestPath of manifestPaths) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse ${relativePath(manifestPath)}: ${message}`);
    process.exit(1);
  }

  for (const field of dependencyFields) {
    const dependencies = manifest[field] ?? {};
    for (const [name, spec] of Object.entries(dependencies)) {
      if (!isAllowedDependencySpec(spec)) {
        violations.push(
          `${relativePath(manifestPath)} :: ${field}.${name} = ${spec}`,
        );
      }
    }
  }

  if (manifest.pnpm?.overrides) {
    for (const [name, spec] of Object.entries(manifest.pnpm.overrides)) {
      if (!isAllowedOverrideSpec(spec)) {
        violations.push(
          `${relativePath(manifestPath)} :: pnpm.overrides.${name} = ${spec}`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Exact dependency versions are required.");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

function collectPackageJsonPaths(dirPath, results) {
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectPackageJsonPaths(entryPath, results);
      continue;
    }

    if (entry.isFile() && entry.name === "package.json") {
      results.push(entryPath);
    }
  }
}

function isAllowedDependencySpec(spec) {
  return (
    isExactVersion(spec) ||
    spec === "workspace:*" ||
    isExactWorkspaceVersion(spec) ||
    spec.startsWith("file:") ||
    spec.startsWith("link:") ||
    spec.startsWith("portal:")
  );
}

function isAllowedOverrideSpec(spec) {
  return isExactVersion(spec);
}

function isExactVersion(spec) {
  if (typeof spec !== "string") {
    return false;
  }

  if (exactVersionPattern.test(spec)) {
    return true;
  }

  if (spec.startsWith("npm:")) {
    const aliasIndex = spec.lastIndexOf("@");
    return (
      aliasIndex > "npm:".length && isExactVersion(spec.slice(aliasIndex + 1))
    );
  }

  return false;
}

function isExactWorkspaceVersion(spec) {
  if (!spec.startsWith("workspace:")) {
    return false;
  }

  return isExactVersion(spec.slice("workspace:".length));
}

function relativePath(filePath) {
  return path.relative(rootDir, filePath) || ".";
}
