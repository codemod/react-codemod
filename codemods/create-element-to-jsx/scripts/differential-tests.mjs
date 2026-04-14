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
const legacyTransformPath = "/Users/mohabsameh/Downloads/react-codemod/transforms/create-element-to-jsx.js";

function runLegacy(source) {
  const dir = mkdtempSync(path.join(tmpdir(), "ce2jsx-legacy-"));
  const inputPath = path.join(dir, "input.js");
  writeFileSync(inputPath, source, "utf8");

  try {
    const result = spawnSync(
      "npx",
      [
        "--yes",
        "jscodeshift",
        "-t",
        legacyTransformPath,
        inputPath,
        "--run-in-band",
        "--parser",
        "flow",
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

const parityCases = {
  "member_simple_comments": `var React = require('react');
React.createElement(/*A*/Foo/*B*/./*C*/Bar/*D*/);
`,
  "spread_prop_comments": `var React = require('react');
React.createElement('div', /*A*/getProps()/*B*/, 'x');
`,
  "member_child_comments_alt": `var React = require('react');
React.createElement('div', null, React.createElement(/*A*/Foo/*B*/./*C*/Bar/*D*/) /*E*/);
`,
  "comment_only_props_string_child": `var React = require('react');
React.createElement(Foo, {/*P*/}, 'x');
`,
};

for (const [name, source] of Object.entries(parityCases)) {
  test(`matches legacy output for ${name}`, () => {
    const legacyOutput = runLegacy(source);
    const jssgOutput = runJssg(source);
    assert.strictEqual(jssgOutput, legacyOutput);
  });
}
