import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

function reindentText(text: string, fromCol: number, toCol: number): string {
  if (fromCol === toCol) return text;
  const lines = text.split("\n");
  const delta = toCol - fromCol;
  return lines
    .map((line, i) => {
      if (i === 0) return line;
      if (delta > 0) return " ".repeat(delta) + line;
      const strip = Math.min(-delta, line.length - line.trimStart().length);
      return line.slice(strip);
    })
    .join("\n");
}

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

function findNamedImportNames(rootNode: SgNode<TSX, "program">, exportedName: string): Set<string> {
  const names = new Set<string>();

  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== "react-dom") continue;

    for (const specifier of importNode.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.field("name")?.text() !== exportedName) continue;
      names.add(specifier.field("alias")?.text() ?? exportedName);
    }
  }

  return names;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const transformMetric = useMetricAtom("reactdom-render-replacements");

  const reactDomMemberImportNames = findReactDomMemberImportNames(rootNode);
  const reactDomRenderImportNames = findNamedImportNames(rootNode, "render");
  const reactDomUnmountImportNames = findNamedImportNames(rootNode, "unmountComponentAtNode");

  if (reactDomMemberImportNames.size === 0 && reactDomRenderImportNames.size === 0 && reactDomUnmountImportNames.size === 0) {
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
  const sourceLines = sourceCode.split("\n");

  const getIndent = (statement: SgNode<TSX>): string => {
    const line = sourceLines[statement.range().start.line] ?? "";
    const match = line.match(/^(\s*)/);
    return match ? match[1] : "";
  };

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
    const indent = getIndent(statement);
    const elementText = element.text();

    let renderCall: string;
    if (elementText.includes("\n")) {
      const elementStartLine = sourceLines[element.range().start.line] ?? "";
      const originalCol = elementStartLine.length - elementStartLine.trimStart().length;
      const desiredCol = indent.length + 2;
      const reindented = reindentText(elementText, originalCol, desiredCol);
      renderCall = `${rootName}.render(\n${" ".repeat(desiredCol)}${reindented}\n${indent})`;
    } else {
      renderCall = `${rootName}.render(${elementText})`;
    }

    const replacement = `const ${rootName} = createRoot(${container.text()});\n${indent}${renderCall};`;
    edits.push(statement.replace(replacement));
    hasTransformations = true;
    transformMetric.increment({
      pattern,
      file: metricFile(root.filename()),
    });
  };

  const applyUnmountReplacement = (call: SgNode<TSX>, pattern: string): void => {
    const args = call.field("arguments");
    if (!args) return;

    const argList = args.children().filter((child) =>
      child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
    );

    if (argList.length < 1) return;

    const container = argList[0]!;
    const statement = call.ancestors().find((ancestor) => ancestor.kind() === "expression_statement");
    if (!statement) return;

    const rootName = nextRootName();
    const indent = getIndent(statement);

    const replacement = `const ${rootName} = createRoot(${container.text()});\n${indent}${rootName}.unmount();`;
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

    const memberUnmountCalls = rootNode.findAll({
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
                regex: "^unmountComponentAtNode$",
              },
            },
          ],
        },
      },
    });

    for (const call of memberUnmountCalls) {
      const callee = call.field("function");
      const objectNode = callee?.field("object");
      if (!objectNode || !reactDomMemberImportNames.has(objectNode.text())) continue;
      applyUnmountReplacement(call, "ReactDOM.unmountComponentAtNode");
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

  if (reactDomUnmountImportNames.size > 0) {
    const unmountCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: ".*",
        },
      },
    });

    for (const call of unmountCalls) {
      const callee = call.field("function");
      if (!callee || !reactDomUnmountImportNames.has(callee.text())) continue;
      applyUnmountReplacement(call, "unmountComponentAtNode");
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
