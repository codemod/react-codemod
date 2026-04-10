import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

type Conversion = {
  code: string;
  count: number;
  hasComments: boolean;
};

const REACT_MODULES = new Set(["React", "react", "react/addons", "react-native"]);

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function lineIndent(source: string, index: number): string {
  let lineStart = index;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") {
    lineStart--;
  }

  let end = lineStart;
  while (end < source.length && (source[end] === " " || source[end] === "\t")) {
    end++;
  }

  return source.slice(lineStart, end);
}

function indentAll(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function prefixFirstLine(text: string, prefix: string): string {
  const newline = text.indexOf("\n");
  if (newline === -1) {
    return `${prefix}${text}`;
  }

  return `${prefix}${text.slice(0, newline)}${text.slice(newline)}`;
}

function startsLowercase(value: string): boolean {
  const first = value[0];
  return first !== undefined && first >= "a" && first <= "z";
}

function encodeJSXTextValue(value: string): string {
  return value.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function stringValue(node: SgNode<TSX>): string {
  if (node.kind() !== "string") {
    throw new Error(`Expected string node, got "${node.kind()}"`);
  }

  const evaluated = Function(`"use strict"; return (${node.text()});`)() as unknown;
  if (typeof evaluated !== "string") {
    throw new Error(`Expected string literal, got "${typeof evaluated}"`);
  }

  return evaluated;
}

function isReactModuleName(value: string | null): boolean {
  return value !== null && REACT_MODULES.has(value);
}

function stringNodeFrom(node: SgNode<TSX>): SgNode<TSX> | null {
  if (node.kind() === "string") {
    return node;
  }

  return node.find({ rule: { kind: "string" } });
}

function requireSource(call: SgNode<TSX>): string | null {
  const callee = call.field("function");
  if (!callee || callee.kind() !== "identifier" || callee.text() !== "require") {
    return null;
  }

  const args = callArguments(call);
  const firstArg = args[0];
  if (!firstArg || firstArg.kind() !== "string") {
    return null;
  }

  return stringValue(firstArg);
}

function importSource(node: SgNode<TSX>): string | null {
  const sourceNode = node.field("source") ?? stringNodeFrom(node);
  if (!sourceNode || sourceNode.kind() !== "string") {
    return null;
  }

  return stringValue(sourceNode);
}

function hasReact(rootNode: SgNode<TSX>): boolean {
  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (isReactModuleName(importSource(importNode))) {
      return true;
    }
  }

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (isReactModuleName(requireSource(call))) {
      return true;
    }
  }

  return false;
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  const args = call.field("arguments");
  if (!args) {
    return [];
  }

  return args.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function isReactCreateElementCall(node: SgNode<TSX>): boolean {
  if (node.kind() !== "call_expression") {
    return false;
  }

  const callee = node.field("function");
  if (!callee || callee.kind() !== "member_expression") {
    return false;
  }

  const object = callee.field("object");
  const property = callee.field("property");

  return object?.kind() === "identifier" &&
    object.text() === "React" &&
    property?.kind() === "property_identifier" &&
    property.text() === "createElement";
}

function closestCreateElementAncestor(node: SgNode<TSX>): SgNode<TSX> | null {
  for (const ancestor of node.ancestors()) {
    if (isReactCreateElementCall(ancestor)) {
      return ancestor;
    }
  }

  return null;
}

function ownCommentTexts(call: SgNode<TSX>): string[] {
  return call.findAll({ rule: { kind: "comment" } })
    .filter((comment) => closestCreateElementAncestor(comment)?.id() === call.id())
    .sort((left, right) => left.range().start.index - right.range().start.index)
    .map((comment) => comment.text());
}

function jsxReference(node: SgNode<TSX>): string | null {
  if (node.kind() === "identifier" || node.kind() === "property_identifier") {
    return node.text();
  }

  if (node.kind() === "string") {
    return stringValue(node);
  }

  if (node.kind() !== "member_expression") {
    return null;
  }

  const object = node.field("object");
  const property = node.field("property");
  if (!object || !property) {
    return null;
  }

  const objectRef = jsxReference(object);
  const propertyRef = jsxReference(property);
  if (!objectRef || !propertyRef) {
    return null;
  }

  return `${objectRef}.${propertyRef}`;
}

function topLevelJsxTag(node: SgNode<TSX>): string | null {
  const reference = jsxReference(node);
  if (!reference) {
    return null;
  }

  if (node.kind() === "identifier" && startsLowercase(node.text())) {
    return null;
  }

  if (node.kind() === "string" && !startsLowercase(stringValue(node))) {
    return null;
  }

  return reference;
}

function legacyType(node: SgNode<TSX>): string {
  switch (node.kind()) {
    case "call_expression":
      return "CallExpression";
    case "identifier":
      return "Identifier";
    case "member_expression":
      return "MemberExpression";
    case "object":
      return "ObjectExpression";
    case "spread_element":
      return "SpreadElement";
    case "string":
    case "number":
    case "true":
    case "false":
    case "null":
      return "Literal";
    default:
      return node.kind();
  }
}

function canLiteralBePropString(node: SgNode<TSX>, value: string): boolean {
  return !node.text().includes("\\") && !value.includes("\"");
}

function spreadArgument(node: SgNode<TSX>): SgNode<TSX> | null {
  return node.children().find((child) => child.isNamed() && child.kind() !== "comment") ?? null;
}

function attrName(node: SgNode<TSX>): string {
  if (node.kind() === "property_identifier" || node.kind() === "identifier") {
    return node.text();
  }

  if (node.kind() === "string") {
    return stringValue(node);
  }

  throw new Error(`Unexpected property key type "${legacyType(node)}"`);
}

function pairToAttribute(pair: SgNode<TSX>): string {
  const key = pair.field("key");
  const value = pair.field("value");
  if (!key || !value) {
    throw new Error("Expected object property to have key and value");
  }

  const name = attrName(key);
  if (value.kind() === "string") {
    const literal = stringValue(value);
    if (canLiteralBePropString(value, literal)) {
      return `${name}="${literal}"`;
    }
  }

  return `${name}={${value.text()}}`;
}

function isMemberCall(node: SgNode<TSX>, objectName: string, propertyName: string): boolean {
  if (node.kind() !== "call_expression") {
    return false;
  }

  const callee = node.field("function");
  if (!callee || callee.kind() !== "member_expression") {
    return false;
  }

  const object = callee.field("object");
  const property = callee.field("property");

  return object?.kind() === "identifier" &&
    object.text() === objectName &&
    property?.kind() === "property_identifier" &&
    property.text() === propertyName;
}

function propsToAttributes(node: SgNode<TSX> | null): string[] {
  if (!node || node.kind() === "null") {
    return [];
  }

  if (isMemberCall(node, "React", "__spread") || isMemberCall(node, "Object", "assign")) {
    return callArguments(node).flatMap((arg) => propsToAttributes(arg));
  }

  if (
    node.kind() === "identifier" ||
    node.kind() === "member_expression" ||
    node.kind() === "call_expression"
  ) {
    return [`{...${node.text()}}`];
  }

  if (node.kind() !== "object") {
    throw new Error(`Unexpected attribute of type "${legacyType(node)}"`);
  }

  const attributes: string[] = [];
  for (const child of node.children()) {
    if (!child.isNamed()) {
      continue;
    }

    if (child.kind() === "comment") {
      continue;
    }

    if (child.kind() === "spread_element") {
      const argument = spreadArgument(child);
      if (!argument) {
        throw new Error("Expected spread element argument");
      }

      attributes.push(`{...${argument.text()}}`);
      continue;
    }

    if (child.kind() === "pair") {
      attributes.push(pairToAttribute(child));
    }
  }

  return attributes;
}

function renderExpression(code: string, baseIndent: string): string {
  if (!code.includes("\n")) {
    return `{${code}}`;
  }

  return `{\n${indentAll(code, `${baseIndent}  `)}\n${baseIndent}}`;
}

function renderChild(node: SgNode<TSX>, baseIndent: string): { code: string; count: number } {
  if (node.kind() === "string") {
    const value = stringValue(node);
    if (value !== "" && value.trim() === value) {
      return { code: encodeJSXTextValue(value), count: 0 };
    }

    return { code: renderExpression(node.text(), baseIndent), count: 0 };
  }

  if (node.kind() === "spread_element") {
    const argument = spreadArgument(node);
    if (!argument) {
      throw new Error("Expected spread child argument");
    }

    return { code: renderExpression(argument.text(), baseIndent), count: 0 };
  }

  if (isReactCreateElementCall(node)) {
    const nested = convertCall(node, baseIndent);
    if (!nested) {
      return { code: renderExpression(node.text(), baseIndent), count: 0 };
    }

    return {
      code: nested.hasComments ? renderExpression(nested.code, baseIndent) : nested.code,
      count: nested.count,
    };
  }

  return { code: renderExpression(node.text(), baseIndent), count: 0 };
}

function wrapWithComments(jsx: string, comments: string[], baseIndent: string): string {
  const innerIndent = `${baseIndent}  `;
  const commentBlock = comments.map((comment) => `${innerIndent}${comment}`).join("\n");
  return `(\n${commentBlock}\n${indentAll(jsx, innerIndent)}\n${baseIndent})`;
}

function convertCall(call: SgNode<TSX>, baseIndent: string): Conversion | null {
  const args = callArguments(call);
  const elementArg = args[0];
  if (!elementArg) {
    return null;
  }

  const tag = topLevelJsxTag(elementArg);
  if (!tag) {
    return null;
  }

  const propsArg = args[1] ?? null;
  const attributes = propsToAttributes(propsArg);
  const childIndent = `${baseIndent}  `;
  const childResults = args.slice(2).map((child) => renderChild(child, childIndent));
  const attributeSuffix = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

  let jsx = `<${tag}${attributeSuffix}`;
  let count = 1;
  for (const child of childResults) {
    count += child.count;
  }

  if (childResults.length === 0) {
    jsx += " />";
  } else {
    const childLines = childResults.map((child) => prefixFirstLine(child.code, childIndent));
    jsx += `>\n${childLines.join("\n")}\n${baseIndent}</${tag}>`;
  }

  const comments = ownCommentTexts(call);
  if (comments.length === 0) {
    return { code: jsx, count, hasComments: false };
  }

  return {
    code: wrapWithComments(jsx, comments, baseIndent),
    count,
    hasComments: true,
  };
}

function explicitRequireDisabled(value: unknown): boolean {
  return value === false || value === "false";
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("create-element-to-jsx-conversions");
  const convertibility = new Map<number, boolean>();
  let totalConversions = 0;

  if (!explicitRequireDisabled(options.params?.["explicit-require"]) && !hasReact(rootNode)) {
    return null;
  }

  const canConvertCall = (call: SgNode<TSX>): boolean => {
    const cached = convertibility.get(call.id());
    if (cached !== undefined) {
      return cached;
    }

    const args = callArguments(call);
    const elementArg = args[0];
    const convertible = elementArg !== undefined && topLevelJsxTag(elementArg) !== null;
    convertibility.set(call.id(), convertible);
    return convertible;
  };

  const createElementCalls = rootNode.findAll({ rule: { kind: "call_expression" } })
    .filter(isReactCreateElementCall);

  for (const call of createElementCalls) {
    const coveredByAncestor = call.ancestors().some((ancestor) =>
      isReactCreateElementCall(ancestor) && canConvertCall(ancestor)
    );
    if (coveredByAncestor) {
      continue;
    }

    const baseIndent = lineIndent(source, call.range().start.index);
    const conversion = convertCall(call, baseIndent);
    if (!conversion) {
      continue;
    }

    edits.push(call.replace(conversion.code));
    totalConversions += conversion.count;
  }

  if (edits.length === 0) {
    return null;
  }

  metric.increment({
    file: metricFile(root.filename()),
  }, totalConversions);

  return rootNode.commitEdits(edits);
};

export default transform;
