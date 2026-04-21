import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

type Conversion = {
  code: string;
  count: number;
  hasComments: boolean;
};

type TagDescriptor = {
  text: string;
  identifierComments: string[];
};

type AttrDescriptor = {
  leadingBlocks: string[];
  inline: string;
  hasComments: boolean;
};

type RenderedElement = {
  core: string;
  count: number;
  leadingComments: string[];
  trailingComments: string[];
  hasComments: boolean;
  expressionTrailingComments?: string[];
};

type ArgumentLayout = {
  args: SgNode<TSX>[];
  boundaryComments: SgNode<TSX>[][];
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

function ownCommentNodes(call: SgNode<TSX>): SgNode<TSX>[] {
  return call.findAll({ rule: { kind: "comment" } })
    .filter((comment) => closestCreateElementAncestor(comment)?.id() === call.id())
    .sort((left, right) => left.range().start.index - right.range().start.index);
}

function directCommentNodes(node: SgNode<TSX> | null): SgNode<TSX>[] {
  if (!node) {
    return [];
  }

  return node.children()
    .filter((child) => child.kind() === "comment")
    .sort((left, right) => left.range().start.index - right.range().start.index);
}

function directCommentTexts(node: SgNode<TSX> | null): string[] {
  return directCommentNodes(node).map((comment) => comment.text());
}

function subtractComments(comments: SgNode<TSX>[], excluded: SgNode<TSX>[]): SgNode<TSX>[] {
  const excludedIds = new Set(excluded.map((comment) => comment.id()));
  return comments.filter((comment) => !excludedIds.has(comment.id()));
}

function splitDirectComments(node: SgNode<TSX>, comments = directCommentNodes(node)): {
  before: SgNode<TSX>[];
  after: SgNode<TSX>[];
  all: SgNode<TSX>[];
} {
  const nodeText = node.text();
  const nodeStart = node.range().start.index;
  const nodeEnd = node.range().end.index;
  let tokenStart = nodeStart;
  let tokenEnd = nodeEnd;

  if (comments.length > 0) {
    const start = Math.min(nodeStart, ...comments.map((comment) => comment.range().start.index));
    const end = Math.max(nodeEnd, ...comments.map((comment) => comment.range().end.index));
    const segment = node.getRoot().root().text().slice(start, end);
    const tokenOffset = segment.indexOf(nodeText);
    if (tokenOffset >= 0) {
      tokenStart = start + tokenOffset;
      tokenEnd = tokenStart + nodeText.length;
    }
  }

  return {
    before: comments.filter((comment) => comment.range().end.index <= tokenStart),
    after: comments.filter((comment) => comment.range().start.index >= tokenEnd),
    all: comments,
  };
}

function joinCommentTexts(comments: SgNode<TSX>[], source: string): string {
  if (comments.length === 0) {
    return "";
  }

  let text = comments[0]!.text();
  for (let i = 1; i < comments.length; i++) {
    const previous = comments[i - 1]!;
    const current = comments[i]!;
    const between = source.slice(previous.range().end.index, current.range().start.index);
    text += between.includes("\n") ? "" : between;
    text += current.text();
  }

  return text;
}

function commentsPrefixText(comments: SgNode<TSX>[], nextStart: number, source: string): string {
  if (comments.length === 0) {
    return "";
  }

  const last = comments[comments.length - 1]!;
  return `${joinCommentTexts(comments, source)}${source.slice(last.range().end.index, nextStart)}`;
}

function trailingInlineCommentTexts(comments: SgNode<TSX>[], anchorEnd: number, source: string): string[] {
  if (comments.length === 0) {
    return [];
  }

  const texts: string[] = [];
  let cursor = anchorEnd;
  for (const comment of comments) {
    texts.push(`${source.slice(cursor, comment.range().start.index)}${comment.text()}`);
    cursor = comment.range().end.index;
  }
  return texts;
}

function tokenSourceWithComments(node: SgNode<TSX>, rendered: string, source: string): string {
  const split = splitDirectComments(node);
  const beforeStart = split.before.length > 0
    ? Math.min(...split.before.map((comment) => comment.range().start.index))
    : node.range().start.index;
  const beforeText = source.slice(beforeStart, node.range().start.index);
  const afterEnd = split.after.length > 0
    ? Math.max(...split.after.map((comment) => comment.range().end.index))
    : node.range().end.index;
  const afterText = source.slice(node.range().end.index, afterEnd);
  return `${beforeText}${rendered}${afterText}`;
}

function commentBlocks(comments: SgNode<TSX>[], source: string): string[] {
  if (comments.length === 0) {
    return [];
  }

  const blocks = [comments[0]!.text()];
  for (let i = 1; i < comments.length; i++) {
    const previous = comments[i - 1]!;
    const current = comments[i]!;
    const between = source.slice(previous.range().end.index, current.range().start.index);
    if (between.includes("\n")) {
      blocks.push(current.text());
    } else {
      blocks[blocks.length - 1] += between + current.text();
    }
  }

  return blocks;
}

function isLineComment(text: string): boolean {
  return text.startsWith("//");
}

function argumentLayout(call: SgNode<TSX>): ArgumentLayout {
  const argsNode = call.field("arguments");
  if (!argsNode) {
    return { args: [], boundaryComments: [[]] };
  }

  const rawChildren = argsNode.children();
  const args: SgNode<TSX>[] = [];
  const boundaryComments: SgNode<TSX>[][] = [[]];
  let seenArgs = 0;

  for (const child of rawChildren) {
    if (child.kind() === "comment") {
      boundaryComments[seenArgs]!.push(child);
      continue;
    }

    if (child.isNamed()) {
      args.push(child);
      seenArgs++;
      if (!boundaryComments[seenArgs]) {
        boundaryComments[seenArgs] = [];
      }
    }
  }

  return { args, boundaryComments };
}

function detachedLeadingComments(call: SgNode<TSX>): SgNode<TSX>[] {
  const parent = call.parent();
  if (!parent || parent.kind() === "arguments" || parent.kind() === "call_expression") {
    return [];
  }

  return parent.children()
    .filter((child) => child.kind() === "comment" && child.range().end.index <= call.range().start.index)
    .sort((left, right) => left.range().start.index - right.range().start.index);
}

function splitBoundaryCommentsByComma(
  anchorNode: SgNode<TSX>,
  comments: SgNode<TSX>[],
  source: string,
): { beforeComma: SgNode<TSX>[]; afterComma: SgNode<TSX>[] } {
  const beforeComma: SgNode<TSX>[] = [];
  const afterComma: SgNode<TSX>[] = [];
  for (const comment of comments) {
    const between = source.slice(anchorNode.range().end.index, comment.range().start.index);
    if (between.includes(",")) {
      afterComma.push(comment);
    } else {
      beforeComma.push(comment);
    }
  }
  return { beforeComma, afterComma };
}

function tagDescriptor(node: SgNode<TSX>): TagDescriptor | null {
  if (node.kind() === "identifier" || node.kind() === "property_identifier") {
    return { text: node.text(), identifierComments: directCommentTexts(node) };
  }

  if (node.kind() === "string") {
    return { text: stringValue(node), identifierComments: directCommentTexts(node) };
  }

  if (node.kind() !== "member_expression") {
    return null;
  }

  const object = node.field("object");
  const property = node.field("property");
  if (!object || !property) {
    return null;
  }

  const objectTag = tagDescriptor(object);
  const propertyTag = tagDescriptor(property);
  if (!objectTag || !propertyTag) {
    return null;
  }

  return {
    text: `${objectTag.text}.${propertyTag.text}`,
    identifierComments: [
      ...directCommentTexts(node),
      ...objectTag.identifierComments,
      ...propertyTag.identifierComments,
    ],
  };
}

function renderTokenWithComments(node: SgNode<TSX>, text: string, source: string): string {
  return tokenSourceWithComments(node, text, source);
}

function renderPropValue(node: SgNode<TSX>, source: string): string {
  if (node.kind() === "string") {
    const literal = stringValue(node);
    if (canLiteralBePropString(node, literal)) {
      return renderTokenWithComments(node, `"${literal}"`, source);
    }
  }

  const split = splitDirectComments(node);
  return `{${joinCommentTexts(split.before, source)}${node.text()}${joinCommentTexts(split.after, source)}}`;
}

function spreadAttrDescriptor(node: SgNode<TSX>, source: string): AttrDescriptor {
  const argument = spreadArgument(node);
  if (!argument) {
    throw new Error("Expected spread element argument");
  }

  return {
    leadingBlocks: commentBlocks(directCommentNodes(node), source),
    inline: `{...${tokenSourceWithComments(argument, argument.text(), source)}}`,
    hasComments: directCommentNodes(node).length > 0 || directCommentNodes(argument).length > 0,
  };
}

function pairInlineDescriptor(
  node: SgNode<TSX>,
  source: string,
  prefixInlineComments: string[],
  suffixInlineComments: string[],
  leadingBlocks: string[],
): AttrDescriptor {
  const key = node.field("key");
  const value = node.field("value");
  if (!key || !value) {
    throw new Error("Expected object property to have key and value");
  }

  const pairComments = directCommentNodes(node);
  const keyAfter = pairComments[0] ? [pairComments[0]!] : [];
  const valueBefore = pairComments.slice(1);
  const keyText = `${prefixInlineComments.join("")}${attrName(key)}${joinCommentTexts(keyAfter, source)}`;
  const valueText = (() => {
    if (value.kind() === "string") {
      const literal = stringValue(value);
      if (canLiteralBePropString(value, literal)) {
        return `${commentsPrefixText(valueBefore, value.range().start.index, source)}"${literal}"${suffixInlineComments.join("")}`;
      }
    }
    return `{${commentsPrefixText(valueBefore, value.range().start.index, source)}${value.text()}}${suffixInlineComments.join("")}`;
  })();

  return {
    leadingBlocks,
    inline: `${keyText}=${valueText}`,
    hasComments:
      leadingBlocks.length > 0 ||
      prefixInlineComments.length > 0 ||
      suffixInlineComments.length > 0 ||
      pairComments.length > 0,
  };
}

function propsToDescriptors(node: SgNode<TSX> | null, source: string): {
  attrs: AttrDescriptor[];
  trailingElementComments: string[];
  consumedBoundaryComments: string[];
} {
  if (!node || node.kind() === "null") {
    return { attrs: [], trailingElementComments: [], consumedBoundaryComments: [] };
  }

  if (isMemberCall(node, "React", "__spread") || isMemberCall(node, "Object", "assign")) {
    const callee = node.field("function");
    const calleeObject = callee?.field("object") ?? null;
    const calleeProperty = callee?.field("property") ?? null;
    const attrs: AttrDescriptor[] = [];
    const trailing = [
      ...directCommentTexts(node),
      ...directCommentTexts(callee),
      ...directCommentTexts(calleeObject),
      ...directCommentTexts(calleeProperty),
    ];

    for (const arg of callArguments(node)) {
      const nested = propsToDescriptors(arg, source);
      attrs.push(...nested.attrs);
      trailing.push(...nested.trailingElementComments);
    }

    return { attrs, trailingElementComments: trailing, consumedBoundaryComments: [] };
  }

  if (
    node.kind() === "identifier" ||
    node.kind() === "member_expression" ||
    node.kind() === "call_expression"
  ) {
    return {
      attrs: [{
        leadingBlocks: [],
        inline: `{...${tokenSourceWithComments(node, node.text(), source)}}`,
        hasComments: directCommentNodes(node).length > 0,
      }],
      trailingElementComments: [],
      consumedBoundaryComments: [],
    };
  }

  if (node.kind() !== "object") {
    throw new Error(`Unexpected attribute of type "${legacyType(node)}"`);
  }

  const attrs: AttrDescriptor[] = [];
  const objectComments = directCommentNodes(node);
  const namedChildrenList = node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  const pendingLeadingBlocks = new Map<number, string[]>();
  const consumedObjectComments = new Set<number>();

  if (namedChildrenList.length === 0) {
    return {
      attrs,
      trailingElementComments: objectComments.map((comment) => comment.text()),
      consumedBoundaryComments: [],
    };
  }

  for (let index = 0; index < namedChildrenList.length; index++) {
    const child = namedChildrenList[index]!;
    const nextChild = namedChildrenList[index + 1];

    if (child.kind() === "spread_element") {
      attrs.push(spreadAttrDescriptor(child, source));
      continue;
    }

    if (child.kind() !== "pair") {
      continue;
    }

    const key = child.field("key");
    const value = child.field("value");
    if (!key || !value) {
      continue;
    }

    const commentsBefore = objectComments.filter((comment) =>
      !consumedObjectComments.has(comment.id()) &&
      comment.range().end.index <= key.range().start.index &&
      comment.range().start.index >= node.range().start.index
    );
    const commentsAfterValue = objectComments.filter((comment) =>
      !consumedObjectComments.has(comment.id()) &&
      comment.range().start.index >= value.range().end.index &&
      comment.range().end.index <= (nextChild?.range().start.index ?? node.range().end.index)
    );

    const beforeComma: SgNode<TSX>[] = [];
    const afterComma: SgNode<TSX>[] = [];
    for (const comment of commentsAfterValue) {
      const between = source.slice(value.range().end.index, comment.range().start.index);
      if (between.includes(",")) {
        afterComma.push(comment);
      } else {
        beforeComma.push(comment);
      }
    }

    const trailingBlocksForCurrent = !nextChild
      ? (commentsBefore.length > 0 && afterComma.length > 0
        ? [`${commentBlocks(commentsBefore, source).join("")}${afterComma.map((comment) => comment.text()).join("")}`]
        : commentBlocks(afterComma, source))
      : [];
    const currentLeadingBlocks = [
      ...(pendingLeadingBlocks.get(index) ?? []),
      ...((!nextChild && afterComma.length > 0)
        ? []
        : (index === 0 ? [] : commentBlocks(commentsBefore, source))),
      ...trailingBlocksForCurrent,
    ];
    const inlinePrefix = index === 0 ? commentsBefore.map((comment) => comment.text()) : [];
    const inlineSuffix = beforeComma.map((comment) => comment.text());

    attrs.push(pairInlineDescriptor(child, source, inlinePrefix, inlineSuffix, currentLeadingBlocks));
    [...commentsBefore, ...beforeComma, ...afterComma].forEach((comment) => consumedObjectComments.add(comment.id()));

    const carryBlocks = nextChild ? commentBlocks(afterComma, source) : [];
    if (carryBlocks.length > 0) {
      const targetIndex = nextChild ? index + 1 : index;
      pendingLeadingBlocks.set(targetIndex, [
        ...(pendingLeadingBlocks.get(targetIndex) ?? []),
        ...carryBlocks,
      ]);
    }
  }

  return {
    attrs,
    trailingElementComments: [],
    consumedBoundaryComments: [],
  };
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

function renderSimpleChild(node: SgNode<TSX>, baseIndent: string): { code: string; count: number } {
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
    const nested = convertSimpleCall(node, baseIndent);
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

function convertSimpleCall(call: SgNode<TSX>, baseIndent: string): Conversion | null {
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
  const childResults = args.slice(2).map((child) => renderSimpleChild(child, childIndent));
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

  return { code: jsx, count, hasComments: false };
}

function renderAttributeDescriptor(attr: AttrDescriptor, indent: string): string {
  const mergedBlocks = [...attr.leadingBlocks];
  if (mergedBlocks.length >= 2 && mergedBlocks[mergedBlocks.length - 1]!.startsWith("//")) {
    mergedBlocks[mergedBlocks.length - 2] = `${mergedBlocks[mergedBlocks.length - 2]!}${mergedBlocks[mergedBlocks.length - 1]!}`;
    mergedBlocks.pop();
  }
  const lines = mergedBlocks.map((block) => `${indent}${block}`);
  lines.push(`${indent}${attr.inline}`);
  return lines.join("\n");
}

function renderExpressionContainer(
  core: string,
  leadingComments: string[],
  trailingComments: string[],
  _indent: string,
): string {
  const leadingText = leadingComments.join("");
  const trailingText = trailingComments.join("");

  if (leadingText.length === 0 && trailingText.length === 0 && !core.includes("\n")) {
    return `{${core}}`;
  }

  if (leadingText.length > 0) {
    if (core.includes("\n")) {
      return `{\n${core}${trailingText}\n}`;
    }
    if (!leadingComments.some(isLineComment)) {
      return `{${leadingText}${core}${trailingText}}`;
    }
    return `{${leadingText}\n${core}${trailingText}}`;
  }

  if (trailingText.length > 0 && !core.includes("\n")) {
    return `{${core}${trailingText}}`;
  }

  return `{\n${core}\n}`;
}

function renderElementCore(
  tag: string,
  attrs: AttrDescriptor[],
  children: { code: string; count: number }[],
  baseIndent: string,
): string {
  const attrIndent = `${baseIndent}  `;
  const hasCommentedAttrs = attrs.some((attr) => attr.leadingBlocks.length > 0);

  if (children.length === 0) {
    if (attrs.length === 0) {
      return `<${tag} />`;
    }

    if (hasCommentedAttrs) {
      return `<${tag}\n${attrs.map((attr) => renderAttributeDescriptor(attr, attrIndent)).join("\n")}\n${baseIndent}/>`;
    }

    return `<${tag} ${attrs.map((attr) => attr.inline).join(" ")} />`;
  }

  let opening = `<${tag}>`;
  if (attrs.length > 0) {
    if (hasCommentedAttrs) {
      const attrLines = attrs.map((attr) => renderAttributeDescriptor(attr, attrIndent));
      attrLines[attrLines.length - 1] = `${attrLines[attrLines.length - 1]!}>`;
      opening = `<${tag}\n${attrLines.join("\n")}`;
    } else {
      opening = `<${tag} ${attrs.map((attr) => attr.inline).join(" ")}>`;
    }
  }

  const childIndent = `${baseIndent}  `;
  const renderedChildren = children.map((child) => indentAll(child.code, childIndent));
  return `${opening}\n${renderedChildren.join("\n")}\n${baseIndent}</${tag}>`;
}

function finalizeRenderedElement(rendered: RenderedElement, baseIndent: string): string {
  if (!rendered.hasComments) {
    return rendered.core;
  }

  if (!rendered.core.includes("\n") && rendered.leadingComments.length === 0 && rendered.trailingComments.length > 0) {
    return `${rendered.core}${rendered.trailingComments.join("")}`;
  }

  if (rendered.leadingComments.length === 0 && rendered.trailingComments.length > 0) {
    return `${rendered.core}${rendered.trailingComments.join("")}`;
  }

  const innerIndent = `${baseIndent}  `;
  const lines: string[] = [];
  if (rendered.leadingComments.length > 0) {
    if (rendered.leadingComments.some(isLineComment)) {
      lines.push(...rendered.leadingComments.map((comment) => `${innerIndent}${comment}`));
      lines.push(indentAll(rendered.core, innerIndent));
    } else {
      const indentedCore = indentAll(rendered.core, innerIndent);
      const coreLines = indentedCore.split("\n");
      coreLines[0] = `${innerIndent}${rendered.leadingComments.join("")}${coreLines[0]!.slice(innerIndent.length)}`;
      lines.push(coreLines.join("\n"));
    }
  } else {
    lines.push(indentAll(rendered.core, innerIndent));
  }

  if (rendered.trailingComments.length > 0) {
    lines.push(`${innerIndent}${rendered.trailingComments.join("")}`);
  }

  return `(\n${lines.join("\n")}\n${baseIndent})`;
}

function commentedChild(
  node: SgNode<TSX>,
  leadingBoundaryComments: SgNode<TSX>[],
  trailingBoundaryComments: SgNode<TSX>[],
  baseIndent: string,
  source: string,
): { code: string; count: number } {
  let boundaryLeading = [
    ...leadingBoundaryComments.map((comment) => comment.text()),
    ...trailingBoundaryComments.map((comment) => comment.text()),
  ];
  let trailingInlineComments: string[] = [];
  if (isReactCreateElementCall(node) && trailingBoundaryComments.length > 0) {
    const split = splitBoundaryCommentsByComma(node, trailingBoundaryComments, source);
    boundaryLeading = [
      ...leadingBoundaryComments.map((comment) => comment.text()),
      ...split.beforeComma.filter((comment) => isLineComment(comment.text())).map((comment) => comment.text()),
      ...split.afterComma.map((comment) => comment.text()),
    ];
    trailingInlineComments = split.beforeComma
      .filter((comment) => !isLineComment(comment.text()))
      .map((comment) => comment.text());
  }
  const directLeading = isReactCreateElementCall(node) ? [] : directCommentTexts(node);
  const leadingComments = [...boundaryLeading, ...directLeading];

  if (node.kind() === "string") {
    const value = stringValue(node);
    if (leadingComments.length === 0 && value !== "" && value.trim() === value) {
      return { code: encodeJSXTextValue(value), count: 0 };
    }

    return {
      code: renderExpressionContainer(node.text(), leadingComments, [], baseIndent),
      count: 0,
    };
  }

  if (node.kind() === "spread_element") {
    const argument = spreadArgument(node);
    if (!argument) {
      throw new Error("Expected spread child argument");
    }

    return {
      code: renderExpressionContainer(argument.text(), leadingComments, [], baseIndent),
      count: 0,
    };
  }

  if (isReactCreateElementCall(node)) {
    const nested = convertCommentedCall(node, baseIndent, source);
    if (!nested) {
      return {
        code: renderExpressionContainer(node.text(), leadingComments, [], baseIndent),
        count: 0,
      };
    }

    if (!nested.hasComments && leadingComments.length === 0) {
      return { code: nested.core, count: nested.count };
    }

    return {
      code: renderExpressionContainer(
        nested.core,
        [...leadingComments, ...nested.leadingComments],
        [
          ...trailingInlineCommentTexts(
            trailingBoundaryComments.filter((comment) => !isLineComment(comment.text())),
            node.range().end.index,
            source,
          ),
          ...(nested.expressionTrailingComments ?? nested.trailingComments),
        ],
        baseIndent,
      ),
      count: nested.count,
    };
  }

  return {
    code: renderExpressionContainer(node.text(), leadingComments, [], baseIndent),
    count: 0,
  };
}

function convertCommentedCall(call: SgNode<TSX>, baseIndent: string, source: string): RenderedElement | null {
  const layout = argumentLayout(call);
  const args = layout.args;
  const elementArg = args[0];
  if (!elementArg) {
    return null;
  }

  const tag = topLevelJsxTag(elementArg);
  if (!tag) {
    return null;
  }

  const tagInfo = tagDescriptor(elementArg);
  if (!tagInfo) {
    return null;
  }

  const callLeadingComments = [
    ...detachedLeadingComments(call).map((comment) => comment.text()),
    ...directCommentTexts(call),
  ];
  const callee = call.field("function");
  const calleeLeadingComments = [
    ...directCommentTexts(callee),
    ...directCommentTexts(callee?.field("object") ?? null),
    ...directCommentTexts(callee?.field("property") ?? null),
  ];

  const beforeFirst = layout.boundaryComments[0] ?? [];
  const betweenTagAndProps = layout.boundaryComments[1] ?? [];
  const propsArg = args[1] ?? null;
  const propsIsSpreadLike = propsArg !== null &&
    (propsArg.kind() === "identifier" || propsArg.kind() === "member_expression" || propsArg.kind() === "call_expression");
  const propsIsNull = propsArg?.kind() === "null";
  const leadingComments = [
    ...callLeadingComments,
    ...calleeLeadingComments,
    ...beforeFirst.filter((comment) => isLineComment(comment.text())).map((comment) => comment.text()),
    ...betweenTagAndProps.filter((comment) => isLineComment(comment.text())).map((comment) => comment.text()),
  ];
  const baseTagPropsTrailing = (propsIsSpreadLike || propsIsNull)
    ? []
    : betweenTagAndProps.filter((comment) => !isLineComment(comment.text())).map((comment) => comment.text());
  const trailingComments = !propsArg && elementArg.kind() === "member_expression"
    ? [
        ...beforeFirst.filter((comment) => !isLineComment(comment.text())).map((comment) => comment.text()),
        ...baseTagPropsTrailing,
        ...tagInfo.identifierComments,
      ]
    : [
        ...tagInfo.identifierComments,
        ...beforeFirst.filter((comment) => !isLineComment(comment.text())).map((comment) => comment.text()),
        ...baseTagPropsTrailing,
      ];

  const propsBoundaryAfter = propsArg && args.length === 2
    ? (layout.boundaryComments[2] ?? [])
    : [];
  const props = propsToDescriptors(propsArg, source);
  if (propsArg && (propsArg.kind() === "identifier" || propsArg.kind() === "member_expression" || propsArg.kind() === "call_expression")) {
    const spreadAttr = props.attrs[0];
    if (spreadAttr) {
      const beforeText = betweenTagAndProps.map((comment) => comment.text()).join("");
      const afterText = propsBoundaryAfter.map((comment) => comment.text()).join("");
      spreadAttr.inline = `{...${beforeText}${propsArg.text()}${afterText}}`;
      spreadAttr.hasComments ||= beforeText.length > 0 || afterText.length > 0;
    }
  }
  if (propsIsNull) {
    const nullPropComments = [
      ...betweenTagAndProps.map((comment) => comment.text()),
      ...propsBoundaryAfter.map((comment) => comment.text()),
    ];
    if (nullPropComments.length > 0) {
      trailingComments.push(` ${nullPropComments[0]!}`, ...nullPropComments.slice(1));
    }
  }
  trailingComments.push(...props.trailingElementComments);

  const childIndent = `${baseIndent}  `;
  const children = args.slice(2).map((child, index) => {
    const argIndex = index + 2;
    let boundaryBefore = argIndex === 2 ? (layout.boundaryComments[argIndex] ?? []) : [];
    if (argIndex === 2 && propsArg) {
      const split = splitBoundaryCommentsByComma(propsArg, boundaryBefore, source);
      if (propsIsSpreadLike) {
        boundaryBefore = [...split.beforeComma, ...split.afterComma];
      } else {
        trailingComments.push(...split.beforeComma.map((comment) => comment.text()));
        boundaryBefore = split.afterComma;
      }
    }
    const boundaryAfter = layout.boundaryComments[argIndex + 1] ?? [];
    return commentedChild(child, boundaryBefore, boundaryAfter, childIndent, source);
  });

  const core = renderElementCore(tagInfo.text, props.attrs, children, "");
  let count = 1;
  for (const child of children) {
    count += child.count;
  }

  return {
    core,
    count,
    leadingComments,
    trailingComments,
    hasComments:
      leadingComments.length > 0 ||
      trailingComments.length > 0 ||
      props.attrs.some((attr) => attr.leadingBlocks.length > 0) ||
      children.some((child) => child.code.includes("\n")),
    // Legacy recast printing duplicates a wrapped member-expression element's
    // element-level trailing comments, then prints identifier-local comments once
    // more. Keep those buckets separate and derive the wrapped form from them.
    expressionTrailingComments:
      !propsArg && elementArg.kind() === "member_expression"
        ? [
            ...trailingComments,
            ...trailingComments,
            ...tagInfo.identifierComments,
          ]
        : undefined,
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
    const conversion = ownCommentNodes(call).length > 0
      ? convertCommentedCall(call, baseIndent, source)
      : convertSimpleCall(call, baseIndent);
    if (!conversion) {
      continue;
    }

    const code = "core" in conversion ? finalizeRenderedElement(conversion, baseIndent) : conversion.code;
    if ("core" in conversion) {
      const detachedComments = detachedLeadingComments(call);
      const replacementStart = detachedComments.length > 0
        ? Math.min(...detachedComments.map((comment) => comment.range().start.index))
        : call.range().start.index;
      edits.push({
        startPos: replacementStart,
        endPos: call.range().end.index,
        insertedText: code,
      });
    } else {
      edits.push(call.replace(code));
    }
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
