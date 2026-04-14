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
  const dir = mkdtempSync(path.join(tmpdir(), "find-dom-node-"));
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
    name: "module.exports createClass",
    input: `var React = require('React');

module.exports = React.createClass({
  render: function() {
    return this.getDOMNode();
  },
});
`,
    expected: `var React = require('React');

module.exports = React.createClass({
  render: function() {
    return React.findDOMNode(this);
  },
});`,
  },
  {
    name: "createClass without React stays unchanged by default",
    input: `var Composer = React.createClass({
  render: function() {
    return this.getDOMNode();
  },
});
`,
    expected: `var Composer = React.createClass({
  render: function() {
    return this.getDOMNode();
  },
});`,
  },
  {
    name: "createClass without React transforms with explicit-require false",
    input: `var Composer = React.createClass({
  render: function() {
    return this.getDOMNode();
  },
});
`,
    params: { "explicit-require": false },
    expected: `var Composer = React.createClass({
  render: function() {
    return React.findDOMNode(this);
  },
});`,
  },
  {
    name: "es6 classes stay unchanged",
    input: `var React = require('React');

class C extends React.Component {
  render() {
    return this.getDOMNode();
  }
}
`,
    expected: `var React = require('React');

class C extends React.Component {
  render() {
    return this.getDOMNode();
  }
}`,
  },
  {
    name: "non-React helpers stay unchanged",
    input: `const helper = foo();
helper.getDOMNode();
`,
    expected: `const helper = foo();
helper.getDOMNode();`,
  },
  {
    name: "computed refs alias is transformed",
    input: `var React = require('React');
var C = React.createClass({
  render: function() {
    var ref = 'foo';
    var thing = this.refs[ref];
    return thing.getDOMNode();
  }
});
`,
    expected: `var React = require('React');
var C = React.createClass({
  render: function() {
    var ref = 'foo';
    var thing = this.refs[ref];
    return React.findDOMNode(thing);
  }
});`,
  },
  {
    name: "deep refs chain is transformed",
    input: `var React = require('React');
var C = React.createClass({
  render: function() {
    return this.refs.main.refs.list.getDOMNode();
  }
});
`,
    expected: `var React = require('React');
var C = React.createClass({
  render: function() {
    return React.findDOMNode(this.refs.main.refs.list);
  }
});`,
  },
  {
    name: "export default createClass remains unchanged",
    input: `var React = require('React');

export default React.createClass({
  render: function() {
    return this.getDOMNode();
  },
});
`,
    expected: `var React = require('React');

export default React.createClass({
  render: function() {
    return this.getDOMNode();
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
