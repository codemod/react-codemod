#!/usr/bin/env node
/**
 * Run the workspace-installed `codemod` CLI while preserving the caller's cwd.
 *
 * Package tests used to call `pnpm dlx codemod@latest`, which races on the
 * shared dlx cache when `pnpm -r test` fans out. Resolving the pinned root
 * dependency avoids that flake and keeps relative paths (./scripts/codemod.ts)
 * correct for each package.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const codemodPkgDir = path.dirname(require.resolve("codemod/package.json"));
const binField = require(path.join(codemodPkgDir, "package.json")).bin;
const binRelative = typeof binField === "string" ? binField : binField.codemod;
const binPath = path.resolve(codemodPkgDir, binRelative);

const result = spawnSync(binPath, process.argv.slice(2), {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
