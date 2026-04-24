import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const packageDir = path.dirname(path.dirname(__filename));
const repoRoot = path.resolve(packageDir, "..", "..");

const packageJson = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
const codemodYaml = readFileSync(path.join(packageDir, "codemod.yaml"), "utf8");
const workflowYaml = readFileSync(path.join(packageDir, "workflow.yaml"), "utf8");
const readme = readFileSync(path.join(packageDir, "README.md"), "utf8");

function extractSources(yamlText) {
  return [...yamlText.matchAll(/source:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPackageDirByName(packageName) {
  const codemodsDir = path.join(repoRoot, "codemods");

  for (const slug of readdirSync(codemodsDir)) {
    const packageJsonPath = path.join(codemodsDir, slug, "package.json");

    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const candidatePackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    if (candidatePackageJson.name === packageName) {
      return path.join(codemodsDir, slug);
    }
  }

  return undefined;
}

test("codemod metadata stays in sync with package.json", () => {
  assert.match(codemodYaml, new RegExp(`name: "${packageJson.name.replaceAll("/", "\\/")}"`));
  assert.match(codemodYaml, new RegExp(`version: "${escapeRegExp(packageJson.version)}"`));
  assert.match(codemodYaml, /workflow: "workflow\.yaml"/);
});

test("workflow only references codemods that exist in this workspace", () => {
  const sources = extractSources(workflowYaml);

  assert.equal(sources.length, 5);

  for (const source of sources) {
    const codemodDir = findPackageDirByName(source);

    assert.ok(codemodDir, `Missing package for ${source}`);
    assert.ok(existsSync(path.join(codemodDir, "codemod.yaml")), `Missing codemod.yaml for ${source}`);

    const referencedPackageJson = JSON.parse(readFileSync(path.join(codemodDir, "package.json"), "utf8"));
    assert.equal(referencedPackageJson.name, source);
  }
});

test("README usage stays aligned with the published package name", () => {
  assert.match(readme, new RegExp(`npx codemod ${packageJson.name} --target <path>`));
});
