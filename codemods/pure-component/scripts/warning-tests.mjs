import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const packageDir = path.dirname(path.dirname(__filename));
const codemodFile = path.join(packageDir, "scripts/codemod.ts");

function runFixtureTest(input, params = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "pure-component-warn-"));
  const caseDir = path.join(root, "case");
  mkdirSync(caseDir);
  writeFileSync(path.join(caseDir, "input.tsx"), input, "utf8");
  writeFileSync(path.join(caseDir, "expected.tsx"), input, "utf8");
  if (Object.keys(params).length > 0) {
    writeFileSync(path.join(caseDir, "test.config.json"), JSON.stringify({ params }, null, 2));
  }

  try {
    return spawnSync(
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
        "--strictness",
        "loose",
      ],
      {
        cwd: packageDir,
        encoding: "utf8",
        timeout: 20000,
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("warns when an impure class is skipped", () => {
  const result = runFixtureTest(`import React from 'React';
class Impure extends React.Component {
  componentWillMount() {}
  render() { return <div/>; }
}
`);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, /Class "Impure" skipped in/);
});

test("suppresses skip warnings with silenceWarnings", () => {
  const result = runFixtureTest(`import React from 'React';
class Impure extends React.Component {
  componentWillMount() {}
  render() { return <div/>; }
}
`, { silenceWarnings: true });
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(combined, /Class "Impure" skipped in/);
});

test("warns when destructuring cannot be applied", () => {
  const result = runFixtureTest(`import React from 'React';
function doSomething(props) { return props; }
class UsesThisDotProps extends React.Component {
  render() {
    doSomething(this.props);
    return <div className={this.props.foo} />;
  }
}
`, { destructuring: true });
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, /Unable to destructure UsesThisDotProps props\./);
});
