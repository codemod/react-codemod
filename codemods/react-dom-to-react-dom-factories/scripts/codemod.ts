import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getAllImports, getImport, updateImport } from "@jssg/utils/javascript/imports";

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

type InlineEdit = {
  start: number;
  end: number;
  text: string;
};

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

function collectReactAliases(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();
  for (const binding of getAllImports(rootNode, { type: "default", from: "react" })) {
    names.add(binding.alias);
  }
  return names;
}

function isReactIdentifier(node: SgNode<TSX> | null, reactAliases: Set<string>): boolean {
  return node?.kind() === "identifier" && reactAliases.has(node.text());
}

function collectDomLocalNames(
  rootNode: SgNode<TSX, "program">,
  reactAliases: Set<string>,
): Set<string> {
  const names = new Set<string>();
  const reactDomImport = getImport(rootNode, { type: "named", name: "DOM", from: "react" });
  if (reactDomImport && !reactDomImport.isNamespace) {
    names.add(reactDomImport.alias);
  }

  for (const pattern of rootNode.findAll({ rule: { kind: "object_pattern" } })) {
    if (!isReactDomDestructurePattern(pattern, reactAliases)) continue;
    for (const shorthand of pattern.findAll({
      rule: { kind: "shorthand_property_identifier_pattern" },
    })) {
      if (shorthand.text() === "DOM") names.add("DOM");
    }
    for (const pair of pattern.findAll({ rule: { kind: "pair_pattern" } })) {
      if (pair.field("key")?.text() !== "DOM") continue;
      const value = pair.field("value");
      if (value && value.kind() === "identifier") names.add(value.text());
    }
  }

  return names;
}

function isReactDomFactoryMember(
  callee: SgNode<TSX>,
  domLocalNames: Set<string>,
  reactAliases: Set<string>,
): { factory: string; target: string } | null {
  if (callee.kind() !== "member_expression") {
    return null;
  }

  const property = callee.field("property");
  const object = callee.field("object");
  if (!property || !object || property.kind() !== "property_identifier") {
    return null;
  }

  if (object.kind() === "identifier" && domLocalNames.has(object.text())) {
    // updateImport renames DOM → createElement and preserves any local alias.
    // Destructured `DOM` shorthand is rewritten to `createElement` in place.
    const target = object.text() === "DOM" ? "createElement" : object.text();
    return { factory: property.text(), target };
  }

  if (object.kind() !== "member_expression") {
    return null;
  }

  const outerProperty = object.field("property");
  const outerObject = object.field("object");
  if (!outerProperty || !outerObject) {
    return null;
  }

  if (outerProperty.text() === "DOM" && isReactIdentifier(outerObject, reactAliases)) {
    return { factory: property.text(), target: `${outerObject.text()}.createElement` };
  }

  return null;
}

function isReactDomDestructurePattern(
  node: SgNode<TSX>,
  reactAliases: Set<string>,
): boolean {
  if (node.kind() !== "object_pattern") {
    return false;
  }

  const declarator = node.parent();
  if (!declarator || declarator.kind() !== "variable_declarator") {
    return false;
  }

  const init = declarator.field("value");
  if (!(isReactIdentifier(init, reactAliases) || isReactRequireCall(init))) {
    return false;
  }

  return node.findAll({ rule: { kind: "shorthand_property_identifier_pattern" } })
    .some((property) => property.text() === "DOM");
}

function matchedFactoryCallInfo(
  call: SgNode<TSX>,
  domLocalNames: Set<string>,
  reactAliases: Set<string>,
): { factory: string; target: string } | null {
  const callee = call.field("function");
  if (!callee) {
    return null;
  }

  return isReactDomFactoryMember(callee, domLocalNames, reactAliases);
}

function applyInlineEdits(source: string, edits: InlineEdit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end),
      source,
    );
}

function rewriteNodeText(
  node: SgNode<TSX>,
  domLocalNames: Set<string>,
  reactAliases: Set<string>,
): string {
  const callMatch = node.kind() === "call_expression"
    ? matchedFactoryCallInfo(node, domLocalNames, reactAliases)
    : null;
  if (callMatch) {
    const argsText = callArguments(node)
      .map((arg) => rewriteNodeText(arg, domLocalNames, reactAliases))
      .join(", ");
    const prefix = argsText.length > 0 ? ", " : "";
    return `${callMatch.target}('${callMatch.factory}'${prefix}${argsText})`;
  }

  const source = node.text();
  const nodeStart = node.range().start.index;
  const edits: InlineEdit[] = [];

  for (const child of namedChildren(node)) {
    const rewritten = rewriteNodeText(child, domLocalNames, reactAliases);
    if (rewritten === child.text()) {
      continue;
    }

    edits.push({
      start: child.range().start.index - nodeStart,
      end: child.range().end.index - nodeStart,
      text: rewritten,
    });
  }

  return edits.length > 0 ? applyInlineEdits(source, edits) : source;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("react-dom-factory-replacements");

  const reactDomImport = getImport(rootNode, { type: "named", name: "DOM", from: "react" });
  const reactAliases = collectReactAliases(rootNode);
  const domLocalNames = collectDomLocalNames(rootNode, reactAliases);

  const matchedCalls = rootNode.findAll({ rule: { kind: "call_expression" } })
    .filter((call) => matchedFactoryCallInfo(call, domLocalNames, reactAliases) !== null);

  for (const call of matchedCalls) {
    const hasMatchedAncestor = call.ancestors().some((ancestor) =>
      ancestor.kind() === "call_expression" &&
      matchedFactoryCallInfo(ancestor, domLocalNames, reactAliases) !== null
    );
    if (hasMatchedAncestor) {
      continue;
    }

    edits.push(call.replace(rewriteNodeText(call, domLocalNames, reactAliases)));
  }

  if (reactDomImport && !reactDomImport.isNamespace) {
    const importEdit = updateImport(rootNode, {
      type: "named",
      from: "react",
      specifiers: [{ name: "DOM", to: "createElement" }],
    });
    if (importEdit) {
      edits.push(importEdit);
    }
  }

  for (const shorthand of rootNode.findAll({ rule: { kind: "shorthand_property_identifier_pattern" } })) {
    if (shorthand.text() !== "DOM") {
      continue;
    }

    const pattern = shorthand.ancestors().find((ancestor) => ancestor.kind() === "object_pattern");
    if (!pattern || !isReactDomDestructurePattern(pattern, reactAliases)) {
      continue;
    }

    edits.push(shorthand.replace("createElement"));
  }

  if (edits.length === 0) {
    return null;
  }

  metric.increment({ file: metricFile(root.filename()) }, matchedCalls.length);
  return rootNode.commitEdits(edits);
};

export default transform;
