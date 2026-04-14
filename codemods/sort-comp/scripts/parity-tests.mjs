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

function writeExtraFiles(root, files) {
  for (const file of files) {
    const fullPath = path.join(root, file.name);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, "utf8");
  }
}

function runJssgWithFiles(source, params = {}, extraFiles = []) {
  const root = mkdtempSync(path.join(tmpdir(), "sort-comp-"));
  const caseDir = path.join(root, "case");
  mkdirSync(caseDir);
  const inputPath = path.join(caseDir, "input.tsx");
  writeFileSync(inputPath, source, "utf8");
  writeFileSync(path.join(caseDir, "expected.tsx"), source, "utf8");
  writeExtraFiles(root, extraFiles);

  try {
    if (Object.keys(params).length > 0) {
      writeFileSync(path.join(caseDir, "test.config.json"), JSON.stringify({ params }, null, 2));
    }
    const result = spawnSync("pnpm", [
      "dlx",
      "codemod@latest",
      "jssg",
      "test",
      "-l",
      "tsx",
      codemodFile,
      root,
      "-u",
    ], {
      cwd: packageDir,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return readFileSync(path.join(caseDir, "expected.tsx"), "utf8").trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const parityCases = [
  {
    name: "createClass without React stays unchanged by default",
    input: `var C = React.createClass({
  render() {
    return <div />;
  },

  a() {},
});
`,
    expected: `var C = React.createClass({
  render() {
    return <div />;
  },

  a() {},
});`,
  },
  {
    name: "createClass without React sorts with explicit-require false",
    input: `var C = React.createClass({
  render() {
    return <div />;
  },

  a() {},
});
`,
    params: { "explicit-require": false },
    expected: `var C = React.createClass({
  a() {},

  render() {
    return <div />;
  },
});`,
  },
  {
    name: "identifier createClass stays unchanged",
    input: `var createClass = require('create-react-class');

var C = createClass({
  render() {
    return <div />;
  },

  a() {},
});
`,
    expected: `var createClass = require('create-react-class');

var C = createClass({
  render() {
    return <div />;
  },

  a() {},
});`,
  },
  {
    name: "unrelated component stays unchanged",
    input: `import { Component } from 'other-lib';

class C extends Component {
  render() {
    return <div />;
  }

  a() {}
}
`,
    expected: `import { Component } from 'other-lib';

class C extends Component {
  render() {
    return <div />;
  }

  a() {}
}`,
  },
  {
    name: "methodsOrder option overrides built-in order",
    input: `var React = require('react/addons');

var C = React.createClass({
  render() {
    return <div />;
  },

  z() {},

  componentDidMount() {},
});
`,
    params: { methodsOrder: JSON.stringify(["componentDidMount", "everything-else", "render"]) },
    expected: `var React = require('react/addons');

var C = React.createClass({
  componentDidMount() {},

  z() {},

  render() {
    return <div />;
  },
});`,
  },
];

for (const testCase of parityCases) {
  test(`matches parity case: ${testCase.name}`, () => {
    const params = { ...(testCase.params ?? {}) };
    const output = runJssgWithFiles(testCase.input, params, testCase.extraFiles ?? []);
    assert.strictEqual(output, testCase.expected);
  });
}
