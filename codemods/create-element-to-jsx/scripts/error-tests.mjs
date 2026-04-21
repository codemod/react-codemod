import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const packageDir = path.dirname(path.dirname(__filename));
const workflowPath = path.join(packageDir, "workflow.yaml");

function runCodemod(input) {
  const target = mkdtempSync(path.join(tmpdir(), "create-element-to-jsx-"));
  const filePath = path.join(target, "input.tsx");
  writeFileSync(filePath, input, "utf8");

  try {
    return spawnSync(
      "pnpm",
      [
        "dlx",
        "codemod@latest",
        "workflow",
        "run",
        "-w",
        workflowPath,
        "--target",
        target,
        "--allow-dirty",
      ],
      {
        cwd: packageDir,
        encoding: "utf8",
      },
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}

test("throws on unsupported props literal", () => {
  const result = runCodemod("var React = require('react/addons');\nReact.createElement('foo', 1);\n");
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, /Unexpected attribute of type .*Literal/);
  assert.match(combined, /Failed to execute codemod|InitializationFailed/);
});
