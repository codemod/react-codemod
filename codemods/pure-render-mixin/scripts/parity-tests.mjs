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

function runJssg(source, params = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pure-render-mixin-"));
  const inputPath = path.join(dir, "input.tsx");
  writeFileSync(inputPath, source, "utf8");
  writeFileSync(path.join(dir, ".gitignore"), "", "utf8");

  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["add", "input.tsx", ".gitignore"], { cwd: dir });
    spawnSync("git", ["commit", "-qm", "init"], { cwd: dir });

    const args = [
      "dlx",
      "codemod@latest",
      "workflow",
      "run",
      "-w",
      workflowPath,
      "--target",
      dir,
      "--allow-dirty",
    ];
    for (const [key, value] of Object.entries(params)) {
      args.push("--param", `${key}=${value}`);
    }

    const result = spawnSync("pnpm", args, {
      cwd: packageDir,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return readFileSync(inputPath, "utf8").trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const parityCases = [
  {
    name: "createClass without React stays unchanged by default",
    input: `var PureRenderMixin = React.addons.PureRenderMixin;

var C = React.createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});
`,
    expected: `var PureRenderMixin = React.addons.PureRenderMixin;

var C = React.createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});`,
  },
  {
    name: "createClass without React transforms with explicit-require false",
    input: `var PureRenderMixin = React.addons.PureRenderMixin;

var C = React.createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});
`,
    params: { "explicit-require": false },
    expected: `var C = React.createClass({
  shouldComponentUpdate: function(nextProps, nextState) {
    return React.addons.shallowCompare(this, nextProps, nextState);
  },

  render: function() {
    return <div />;
  },
});`,
  },
  {
    name: "identifier createClass stays unchanged",
    input: `var React = require('react/addons');
var PureRenderMixin = React.addons.PureRenderMixin;
var createClass = require('create-react-class');

var C = createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});
`,
    expected: `var React = require('react/addons');
var PureRenderMixin = React.addons.PureRenderMixin;
var createClass = require('create-react-class');

var C = createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});`,
  },
];

for (const testCase of parityCases) {
  test(`matches parity case: ${testCase.name}`, () => {
    const output = runJssg(testCase.input, testCase.params ?? {});
    assert.strictEqual(output, testCase.expected);
  });
}
