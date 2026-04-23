import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { cases } from "./parity-cases.mjs";

const __filename = fileURLToPath(import.meta.url);
const packageDir = path.dirname(path.dirname(__filename));
const codemodPath = path.join(packageDir, "scripts", "codemod.ts");
const resultsCache = new Map();

function normalize(value) {
  return value.replace(/\W/gm, "");
}

function assertParses(filename, source) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const messages = parsed.parseDiagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  );
  assert.deepStrictEqual(messages, [], `Parse errors in ${filename}:\n${messages.join("\n")}`);
}

function modeKey(testCase) {
  return testCase.preservePropTypes ?? "none";
}

function caseFilename(index, name) {
  return `${String(index).padStart(2, "0")}-${name}.tsx`;
}

function runMode(mode) {
  const cached = resultsCache.get(mode);
  if (cached) {
    return cached;
  }

  const dir = mkdtempSync(path.join(tmpdir(), `prop-types-typescript-${mode}-`));
  const groupedCases = cases.filter((testCase) => modeKey(testCase) === mode);
  const filenames = new Map();

  try {
    for (const [index, testCase] of groupedCases.entries()) {
      const filename = caseFilename(index, testCase.name);
      filenames.set(testCase.name, filename);
      writeFileSync(path.join(dir, filename), testCase.input, "utf8");
    }

    const command = [
      "dlx",
      "codemod@latest",
      "jssg",
      "run",
      "--language",
      "tsx",
      codemodPath,
      "--target",
      dir,
      "--allow-dirty",
      "--no-interactive",
    ];
    if (mode !== "none") {
      command.push("--param", `preserve-prop-types=${mode}`);
    }

    const result = spawnSync("pnpm", command, {
      cwd: packageDir,
      encoding: "utf8",
      timeout: 120000,
    });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const outputs = new Map();
    for (const testCase of groupedCases) {
      const filename = filenames.get(testCase.name);
      outputs.set(testCase.name, readFileSync(path.join(dir, filename), "utf8"));
    }

    resultsCache.set(mode, outputs);
    return outputs;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const testCase of cases) {
  test(testCase.name, () => {
    const outputs = runMode(modeKey(testCase));
    const actualOutput = outputs.get(testCase.name);
    const expectedOutput = testCase.expected ?? testCase.input;

    assert.ok(actualOutput !== undefined, `Missing output for ${testCase.name}`);
    assertParses(`${testCase.name}.tsx`, actualOutput);
    assertParses(`${testCase.name}.expected.tsx`, expectedOutput);
    assert.strictEqual(normalize(actualOutput), normalize(expectedOutput));
  });
}
