import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const rootReadme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
const legacyReadme = fs.readFileSync(path.join(repoRoot, "LEGACY.md"), "utf8");

const forbiddenRootPatterns = [
  { label: "Codemod Registry command claim", regex: /npx codemod react\// },
  { label: "package-style codemod run claim", regex: /codemod run @react\// },
];

for (const pattern of forbiddenRootPatterns) {
  if (pattern.regex.test(rootReadme)) {
    throw new Error(`README.md contains forbidden ${pattern.label}.`);
  }
}

if (/Codemod Registry/.test(legacyReadme) && /npx codemod react\//.test(legacyReadme)) {
  throw new Error("LEGACY.md must not claim legacy transforms are runnable via Codemod Registry.");
}

const transformRoot = path.join(repoRoot, "codemods", "jssg");
for (const name of fs.readdirSync(transformRoot)) {
  const readmePath = path.join(transformRoot, name, "README.md");
  const contents = fs.readFileSync(readmePath, "utf8");

  if (/codemod run @react\//.test(contents) || /npx codemod react\//.test(contents)) {
    throw new Error(`${path.relative(repoRoot, readmePath)} contains a forbidden published-run claim.`);
  }
}

console.log("Documentation validation passed.");
