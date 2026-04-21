import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const packageDir = path.dirname(path.dirname(__filename));
const codemodFile = path.join(packageDir, "scripts/codemod.ts");
const testsDir = path.join(packageDir, "tests");

function readFixture(name, file) {
  return readFileSync(path.join(testsDir, name, file), "utf8").trim();
}

function readParams(name) {
  const configPath = path.join(testsDir, name, "test.config.json");
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    return config.params ?? {};
  } catch {
    return {};
  }
}

function runJssgOutput(input, params = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "pure-component-jssg-"));
  const caseDir = path.join(root, "case");
  mkdirSync(caseDir);
  writeFileSync(path.join(caseDir, "input.tsx"), input, "utf8");
  writeFileSync(path.join(caseDir, "expected.tsx"), input, "utf8");
  if (Object.keys(params).length > 0) {
    writeFileSync(path.join(caseDir, "test.config.json"), JSON.stringify({ params }, null, 2));
  }

  try {
    const result = spawnSync(
      "pnpm",
      [
        "dlx",
        "codemod@latest",
        "jssg",
        "test",
        "-l",
        "tsx",
        codemodFile,
        root,
        "-u",
      ],
      { cwd: packageDir, encoding: "utf8", timeout: 20000 },
    );
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return readFileSync(path.join(caseDir, "expected.tsx"), "utf8").trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const parityCases = [
  "named-import-component",
  "named-import-purecomponent-alias",
  "export-default-arrow",
  "export-default-function",
  "named-export",
  "named-export-arrow",
  "react-native-named-import",
  "mixed-superclasses",
];

for (const name of parityCases) {
  test(`matches checked-in parity fixture for ${name}`, () => {
    const input = readFixture(name, "input.tsx");
    const expected = readFixture(name, "expected.tsx");
    const params = readParams(name);
    const jssgOutput = runJssgOutput(input, params);
    assert.strictEqual(jssgOutput, expected);
  });
}
