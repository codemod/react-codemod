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
  const target = mkdtempSync(path.join(tmpdir(), "react-to-react-dom-"));
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

function expectFailure(input, pattern) {
  const result = runCodemod(input);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, pattern);
  assert.match(combined, /Failed to execute codemod|InitializationFailed/);
}

test("throws on conflicting ReactDOM binding", () => {
  expectFailure(
    "const ReactDOM = 1;\nimport React from 'react';\nReact.render(null);\n",
    /ReactDOM is already defined in a different scope than React/,
  );
});

test("throws on conflicting ReactDOMServer binding", () => {
  expectFailure(
    "const ReactDOMServer = 1;\nimport React from 'react';\nReact.renderToString(null);\n",
    /ReactDOMServer is already defined in a different scope than React/,
  );
});

test("throws on multiple React declarations", () => {
  expectFailure(
    "import React from 'react';\nimport Foo from 'react';\nReact.render(null);\n",
    /Multiple declarations of React/,
  );
});

test("throws on unknown React member", () => {
  expectFailure(
    "import React from 'react';\nconst x = React.Fragment;\n",
    /Unknown property React\.Fragment/,
  );
});

test("throws on unknown React destructuring", () => {
  expectFailure(
    "var React;\nReact = require('react');\nlet { Fragment } = React;\n",
    /Unknown property React\.Fragment while destructuring/,
  );
});
