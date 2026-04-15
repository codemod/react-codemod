import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function findReactDomMemberImportNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(imp) !== "react-dom") continue;

    const importClause = imp.find({ rule: { kind: "import_clause" } });
    const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");
    if (defaultIdentifier) names.add(defaultIdentifier.text());

    const namespaceImport = imp.find({ rule: { kind: "namespace_import" } });
    const namespaceName =
      namespaceImport?.field("name") ?? namespaceImport?.find({ rule: { kind: "identifier" } });
    if (namespaceName) names.add(namespaceName.text());
  }

  return names;
}

function findNamedRenderImportNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== "react-dom") continue;

    for (const specifier of importNode.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.field("name")?.text() !== "render") continue;
      names.add(specifier.field("alias")?.text() ?? "render");
    }
  }

  return names;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const transformMetric = useMetricAtom("reactdom-render-replacements");

  const reactDomMemberImportNames = findReactDomMemberImportNames(rootNode);
  const reactDomRenderImportNames = findNamedRenderImportNames(rootNode);

  if (reactDomMemberImportNames.size === 0 && reactDomRenderImportNames.size === 0) {
    return null;
  }

  let hasTransformations = false;
  let rootIndex = 0;

  const nextRootName = (): string => {
    const name = rootIndex === 0 ? "root" : `root${rootIndex}`;
    rootIndex += 1;
    return name;
  };

  const sourceCode = rootNode.text();

  const applyRenderReplacement = (call: SgNode<TSX>, pattern: string): void => {
    const args = call.field("arguments");
    if (!args) return;

    const argList = args.children().filter((child) =>
      child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
    );

    if (argList.length < 2) return;

    const element = argList[0]!;
    const container = argList[1]!;
    const statement = call.ancestors().find((ancestor) => ancestor.kind() === "expression_statement");
    if (!statement) return;

    const rootName = nextRootName();
    const stmtStart = statement.range().start.index;
    let indent = "";
    for (let i = stmtStart - 1; i >= 0; i--) {
      const char = sourceCode[i];
      if (char === "\n") break;
      if (char === " " || char === "\t") {
        indent = char + indent;
      } else {
        indent = "";
      }
    }

    const replacement = `const ${rootName} = createRoot(${container.text()});\n${indent}${rootName}.render(${element.text()});`;
    edits.push(statement.replace(replacement));
    hasTransformations = true;
    transformMetric.increment({
      pattern,
      file: metricFile(root.filename()),
    });
  };

  if (reactDomMemberImportNames.size > 0) {
    const memberRenderCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "member_expression",
          all: [
            {
              has: {
                field: "object",
                kind: "identifier",
                regex: ".*",
              },
            },
            {
              has: {
                field: "property",
                kind: "property_identifier",
                regex: "^render$",
              },
            },
          ],
        },
      },
    });

    for (const call of memberRenderCalls) {
      const callee = call.field("function");
      const objectNode = callee?.field("object");
      if (!objectNode || !reactDomMemberImportNames.has(objectNode.text())) continue;
      applyRenderReplacement(call, "ReactDOM.render");
    }
  }

  if (reactDomRenderImportNames.size > 0) {
    const renderCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: ".*",
        },
      },
    });

    for (const call of renderCalls) {
      const callee = call.field("function");
      if (!callee || !reactDomRenderImportNames.has(callee.text())) continue;
      applyRenderReplacement(call, "render");
    }
  }

  if (!hasTransformations) {
    return null;
  }

  const hasCreateRootImport = getImport(rootNode, {
    type: "named",
    name: "createRoot",
    from: "react-dom/client",
  });
  if (!hasCreateRootImport) {
    edits.push({
      startPos: 0,
      endPos: 0,
      insertedText: 'import { createRoot } from "react-dom/client";\n',
    });
  }

  return rootNode.commitEdits(edits);
};

export default transform;
