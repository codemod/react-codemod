import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

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

function stringValue(node: SgNode<TSX>): string {
  const evaluated = Function(`"use strict"; return (${node.text()});`)() as unknown;
  if (typeof evaluated !== "string") {
    throw new Error(`Expected string literal, got "${typeof evaluated}"`);
  }

  return evaluated;
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  return namedChildren(call.field("arguments"));
}

function isReactRequireCall(node: SgNode<TSX> | null): boolean {
  if (!node || node.kind() !== "call_expression") {
    return false;
  }

  const callee = node.field("function");
  const firstArg = callArguments(node)[0];
  return callee?.kind() === "identifier" &&
    callee.text() === "require" &&
    firstArg?.kind() === "string" &&
    stringValue(firstArg) === "react";
}

function isReactIdentifier(node: SgNode<TSX> | null): boolean {
  return node?.kind() === "identifier" && node.text() === "React";
}

function isReactDomFactoryMember(callee: SgNode<TSX>): { factory: string; target: string } | null {
  if (callee.kind() !== "member_expression") {
    return null;
  }

  const property = callee.field("property");
  const object = callee.field("object");
  if (!property || !object || property.kind() !== "property_identifier") {
    return null;
  }

  if (object.kind() === "identifier" && object.text() === "DOM") {
    return { factory: property.text(), target: "createElement" };
  }

  if (object.kind() !== "member_expression") {
    return null;
  }

  const outerProperty = object.field("property");
  const outerObject = object.field("object");
  if (!outerProperty || !outerObject) {
    return null;
  }

  if (outerProperty.text() === "DOM" && isReactIdentifier(outerObject)) {
    return { factory: property.text(), target: "React.createElement" };
  }

  return null;
}

function isReactDomDestructurePattern(node: SgNode<TSX>): boolean {
  if (node.kind() !== "object_pattern") {
    return false;
  }

  const declarator = node.parent();
  if (!declarator || declarator.kind() !== "variable_declarator") {
    return false;
  }

  const init = declarator.field("value");
  return isReactIdentifier(init) || isReactRequireCall(init);
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("react-dom-factory-replacements");
  let callReplacements = 0;

  const reactDomImport = getImport(rootNode, { type: "named", name: "DOM", from: "react" });
  const hasReactDomPattern = rootNode.findAll({ rule: { kind: "object_pattern" } })
    .some(isReactDomDestructurePattern);
  const hasReactDomBinding = reactDomImport !== null || hasReactDomPattern;

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const callee = call.field("function");
    if (!callee) {
      continue;
    }

    const match = isReactDomFactoryMember(callee);
    if (!match) {
      continue;
    }

    if (match.target === "createElement" && !hasReactDomBinding) {
      continue;
    }

    const args = callArguments(call);
    const argsText = args.map((arg) => arg.text()).join(", ");
    const prefix = argsText.length > 0 ? ", " : "";
    edits.push(call.replace(`${match.target}('${match.factory}'${prefix}${argsText})`));
    callReplacements++;
  }

  for (const importSpec of rootNode.findAll({ rule: { kind: "import_specifier" } })) {
    const imported = importSpec.field("name");
    if (!imported || imported.text() !== "DOM") {
      continue;
    }

    const importStmt = importSpec.ancestors().find((ancestor) => ancestor.kind() === "import_statement");
    if (!importStmt) {
      continue;
    }

    const source = importStmt.field("source");
    if (!source || source.kind() !== "string" || stringValue(source) !== "react") {
      continue;
    }

    edits.push(imported.replace("createElement"));
  }

  for (const shorthand of rootNode.findAll({ rule: { kind: "shorthand_property_identifier_pattern" } })) {
    if (shorthand.text() !== "DOM") {
      continue;
    }

    const pattern = shorthand.ancestors().find((ancestor) => ancestor.kind() === "object_pattern");
    if (!pattern || !isReactDomDestructurePattern(pattern)) {
      continue;
    }

    edits.push(shorthand.replace("createElement"));
  }

  if (edits.length === 0) {
    return null;
  }

  metric.increment({ file: metricFile(root.filename()) }, callReplacements);
  return rootNode.commitEdits(edits);
};

export default transform;
