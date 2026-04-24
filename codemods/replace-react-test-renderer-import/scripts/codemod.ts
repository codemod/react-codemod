import type { Edit, SgNode, Transform } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const OLD_MODULE = "react-test-renderer/shallow";
const NEW_MODULE = "react-shallow-renderer";

type ReplacementPattern = "import" | "require" | "export" | "dynamic-import";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function namedChildren(node: SgNode<TSX> | null): SgNode<TSX>[] {
  if (!node) {
    return [];
  }

  return node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function literalContent(node: SgNode<TSX>): string | null {
  if (!node.is("string")) {
    return null;
  }

  const text = node.text();
  if (text.length < 2) {
    return null;
  }

  return text.slice(1, -1).replaceAll("\\/", "/");
}

function literalMatchesOldModule(node: SgNode<TSX>): boolean {
  return literalContent(node) === OLD_MODULE;
}

function fieldMatches(parent: SgNode<TSX>, fieldName: "source", child: SgNode<TSX>): boolean {
  return parent.field(fieldName)?.id() === child.id();
}

function nearestAncestor(node: SgNode<TSX>, kind: string): SgNode<TSX> | null {
  return node.ancestors().find((ancestor) => ancestor.kind() === kind) ?? null;
}

function isFirstCallArgument(call: SgNode<TSX>, node: SgNode<TSX>): boolean {
  return namedChildren(call.field("arguments"))[0]?.id() === node.id();
}

function isDirectRequireCall(call: SgNode<TSX>): boolean {
  const callee = call.field("function");
  return callee?.kind() === "identifier" && callee.text() === "require";
}

function isDynamicImportCall(call: SgNode<TSX>): boolean {
  const callee = call.field("function");
  return callee?.kind() === "import" && callee.text() === "import";
}

function replacementPatternForLiteral(node: SgNode<TSX>): ReplacementPattern | null {
  const importStatement = nearestAncestor(node, "import_statement");
  if (importStatement && fieldMatches(importStatement, "source", node)) {
    return "import";
  }

  const exportStatement = nearestAncestor(node, "export_statement");
  if (exportStatement && fieldMatches(exportStatement, "source", node)) {
    return "export";
  }

  const callExpression = nearestAncestor(node, "call_expression");
  if (!callExpression || !isFirstCallArgument(callExpression, node)) {
    return null;
  }

  if (isDirectRequireCall(callExpression)) {
    return "require";
  }

  if (isDynamicImportCall(callExpression)) {
    return "dynamic-import";
  }

  return null;
}

function replacementEdit(node: SgNode<TSX>): Edit {
  const fragment = node.find({
    rule: {
      kind: "string_fragment",
      regex: `^${OLD_MODULE}$`,
    },
  });

  if (fragment) {
    return fragment.replace(NEW_MODULE);
  }

  const quote = node.text().startsWith("'") ? "'" : "\"";
  return node.replace(`${quote}${NEW_MODULE}${quote}`);
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const metric = useMetricAtom("replace-react-test-renderer-import-replacements");
  const edits: Edit[] = [];

  const moduleLiterals = rootNode.findAll({
    rule: {
      kind: "string",
      has: { kind: "string_fragment" },
    },
  });

  for (const moduleLiteral of moduleLiterals) {
    if (!literalMatchesOldModule(moduleLiteral)) {
      continue;
    }

    const pattern = replacementPatternForLiteral(moduleLiteral);
    if (!pattern) {
      continue;
    }

    edits.push(replacementEdit(moduleLiteral));
    metric.increment({ file: metricFile(root.filename()), pattern });
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default transform;
