import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const packageDir = path.dirname(path.dirname(__filename));
const workflowPath = path.join(packageDir, "workflow.yaml");
const testsDir = path.join(packageDir, "tests");

function readFixture(name, file) {
  return readFileSync(path.join(testsDir, name, file), "utf8").trim();
}

function runJssg(source) {
  const dir = mkdtempSync(path.join(tmpdir(), "ce2jsx-jssg-"));
  const inputPath = path.join(dir, "input.tsx");
  writeFileSync(inputPath, source, "utf8");
  writeFileSync(path.join(dir, ".gitignore"), "", "utf8");

  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["add", "input.tsx", ".gitignore"], { cwd: dir });
    spawnSync("git", ["commit", "-qm", "init"], { cwd: dir });

    const result = spawnSync(
      "pnpm",
      [
        "dlx",
        "codemod@latest",
        "workflow",
        "run",
        "-w",
        workflowPath,
        "--target",
        dir,
        "--allow-dirty",
      ],
      {
        cwd: packageDir,
        encoding: "utf8",
        timeout: 20000,
      },
    );
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return readFileSync(inputPath, "utf8").trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const parityCases = [
  "member-simple-comments",
  "spread-prop-comments",
  "member-child-comments-alt",
  "comment-only-props-string-child",
];

for (const name of parityCases) {
  test(`matches checked-in parity fixture for ${name}`, () => {
    const input = readFixture(name, "input.tsx");
    const expected = readFixture(name, "expected.tsx");
    const jssgOutput = runJssg(input);
    assert.strictEqual(jssgOutput, expected);
  });
}
