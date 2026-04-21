#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const codemodsDir = path.join(repoRoot, "codemods");
const dryRun = process.env.DRY_RUN === "1";

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runGit(args, options = {}) {
  execFileSync("git", args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
}

function tryGit(args, options = {}) {
  try {
    return git(args, options);
  } catch {
    return null;
  }
}

function getChangedPackageJsons() {
  const parentCommit = tryGit(["rev-parse", "HEAD^"]);

  if (!parentCommit) {
    return readdirSync(codemodsDir)
      .sort()
      .map((dir) => path.posix.join("codemods", dir, "package.json"));
  }

  const changed = git([
    "diff",
    "--name-only",
    parentCommit,
    "HEAD",
    "--",
    "codemods/*/package.json",
  ]);

  return changed ? changed.split("\n").filter(Boolean).sort() : [];
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readJsonFromGit(commit, filePath) {
  const contents = tryGit(["show", `${commit}:${filePath}`]);
  return contents ? JSON.parse(contents) : null;
}

function remoteTagExists(tag) {
  return Boolean(tryGit(["ls-remote", "--tags", "origin", `refs/tags/${tag}`]));
}

function localTagExists(tag) {
  return Boolean(tryGit(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]));
}

const parentCommit = tryGit(["rev-parse", "HEAD^"]);
const changedPackageJsons = getChangedPackageJsons();
const changedDirs = [];
const tagsToPush = [];

for (const pkgJsonPath of changedPackageJsons) {
  const absolutePkgJsonPath = path.join(repoRoot, pkgJsonPath);

  if (!existsSync(absolutePkgJsonPath)) {
    console.log(`Skipping ${pkgJsonPath}; package.json no longer exists in the checked-out ref.`);
    continue;
  }

  const pkgJson = readJson(absolutePkgJsonPath);
  const previousPkgJson = parentCommit ? readJsonFromGit(parentCommit, pkgJsonPath) : null;

  if (previousPkgJson?.version === pkgJson.version) {
    continue;
  }

  const dir = path.posix.dirname(pkgJsonPath);
  const codemodYamlPath = path.join(repoRoot, dir, "codemod.yaml");

  if (!existsSync(codemodYamlPath)) {
    console.log(`Skipping ${dir}; no codemod.yaml present.`);
    continue;
  }

  const tag = `${pkgJson.name}@v${pkgJson.version}`;

  if (remoteTagExists(tag)) {
    console.log(`Tag ${tag} already exists on origin, skipping.`);
    continue;
  }

  if (!localTagExists(tag)) {
    console.log(`${dryRun ? "Would create" : "Creating"} tag ${tag}`);
    if (!dryRun) {
      runGit(["tag", tag]);
    }
  } else {
    console.log(`Tag ${tag} already exists locally${dryRun ? "." : ", pushing it."}`);
  }

  changedDirs.push(dir);
  tagsToPush.push(tag);
}

if (!dryRun && tagsToPush.length > 0) {
  runGit(["push", "origin", ...tagsToPush]);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed_dirs=${JSON.stringify(changedDirs)}\n`);
} else {
  console.log(JSON.stringify({ changed_dirs: changedDirs }));
}
