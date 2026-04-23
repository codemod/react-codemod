import type { Edit, SgNode, Transform } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

type PreserveMode = "none" | "unconverted" | "all";
type RenderedType =
  | { kind: "text"; text: string; converted: boolean }
  | {
      kind: "method";
      functionText: string;
      signatureText: string;
      converted: true;
    }
  | { kind: "typeLiteral"; members: InterfaceMember[]; converted: true };

type InterfaceMember = {
  comments: string[];
  converted: boolean;
  keyText: string;
  required: boolean;
  type: RenderedType;
};

type ObjectElement = {
  comments: string[];
  converted: boolean;
  kind: "method" | "pair" | "spread";
  member: InterfaceMember | null;
  node: SgNode<TSX>;
  start: number;
};

type ComponentTarget =
  | {
      kind: "function";
      functionNode: SgNode<TSX>;
      scopeKey: string;
      start: number;
      statement: SgNode<TSX>;
    }
  | {
      kind: "class";
      classNode: SgNode<TSX>;
      scopeKey: string;
      start: number;
      statement: SgNode<TSX>;
    }
  | {
      kind: "forwardRef";
      callNode: SgNode<TSX>;
      scopeKey: string;
      start: number;
      statement: SgNode<TSX>;
    };

type PropTypesEntry = {
  componentName: string;
  container: SgNode<TSX>;
  elements: ObjectElement[];
  kind: "assignment" | "static";
  objectNode: SgNode<TSX> | null;
  target: ComponentTarget | null;
};

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function guessNewline(source: string): string {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function applyEdits(source: string, edits: Array<{ start: number; end: number; text: string }>): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end),
      source,
    );
}

function namedChildren(node: SgNode<TSX> | null): SgNode<TSX>[] {
  if (!node) {
    return [];
  }

  return node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function namedOrCommentChildren(node: SgNode<TSX> | null): SgNode<TSX>[] {
  if (!node) {
    return [];
  }

  return node.children().filter((child) => child.isNamed() || child.kind() === "comment");
}

function firstNamedChild(node: SgNode<TSX> | null): SgNode<TSX> | null {
  return namedChildren(node)[0] ?? null;
}

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) {
    return fragment.text();
  }

  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function topLevelStatement(node: SgNode<TSX>): SgNode<TSX> {
  let current = node;
  while (true) {
    const parent = current.parent();
    if (!parent || parent.kind() === "program") {
      return current;
    }
    current = parent;
  }
}

function isScopeNode(node: SgNode<TSX> | null): boolean {
  return node?.kind() === "program" ||
    node?.kind() === "function_declaration" ||
    node?.kind() === "function_expression" ||
    node?.kind() === "arrow_function";
}

function scopeKey(node: SgNode<TSX>): string {
  return `${node.kind()}:${node.range().start.index}:${node.range().end.index}`;
}

function nearestScopeKey(node: SgNode<TSX>): string {
  let current: SgNode<TSX> | null = node;
  while (current) {
    if (isScopeNode(current)) {
      return scopeKey(current);
    }
    current = current.parent();
  }

  return "program:0:0";
}

function scopeChain(node: SgNode<TSX>): string[] {
  const scopes: string[] = [];
  let current: SgNode<TSX> | null = node;
  while (current) {
    if (isScopeNode(current)) {
      scopes.push(scopeKey(current));
    }
    current = current.parent();
  }
  return scopes;
}

function enclosingStatement(node: SgNode<TSX>): SgNode<TSX> {
  let current = node;
  while (true) {
    const parent = current.parent();
    if (!parent || parent.kind() === "program" || parent.kind() === "class_body") {
      return current;
    }

    const kind = parent.kind();
    if (kind.endsWith("_statement") || kind === "lexical_declaration" || kind === "variable_declaration") {
      return parent;
    }

    current = parent;
  }
}

function lineIndentAt(source: string, index: number): string {
  const lastNewline = source.lastIndexOf("\n", Math.max(index - 1, 0));
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
  const match = /^[\t ]*/.exec(source.slice(lineStart, index));
  return match?.[0] ?? "";
}

function statementRange(node: SgNode<TSX>, source: string): { start: number; end: number } {
  let end = node.range().end.index;
  while (end < source.length && (source[end] === "\n" || source[end] === "\r")) {
    end++;
  }
  return { start: node.range().start.index, end };
}

function classMemberRange(node: SgNode<TSX>, source: string): { start: number; end: number } {
  const start = lineStart(source, node.range().start.index);
  let end = node.range().end.index;
  while (end < source.length && (source[end] === " " || source[end] === "\t")) {
    end++;
  }
  if (source[end] === ";") {
    end++;
  }
  while (end < source.length && (source[end] === " " || source[end] === "\t")) {
    end++;
  }
  while (end < source.length && (source[end] === "\n" || source[end] === "\r")) {
    end++;
  }
  return { start, end };
}

function lineStart(source: string, index: number): number {
  const lastNewline = source.lastIndexOf("\n", Math.max(index - 1, 0));
  return lastNewline === -1 ? 0 : lastNewline + 1;
}

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function removeObjectElementWithComma(element: ObjectElement, source: string): Edit {
  let start = element.start;
  let end = element.node.range().end.index;

  let after = end;
  while (isWhitespace(source[after])) {
    after++;
  }

  if (source[after] === ",") {
    end = after + 1;
    while (isWhitespace(source[end])) {
      end++;
    }
  } else {
    let before = start - 1;
    while (before >= 0 && isWhitespace(source[before])) {
      before--;
    }
    if (source[before] === ",") {
      start = before;
    }
  }

  return { startPos: start, endPos: end, insertedText: "" };
}

function simpleType(text: string, converted = true): RenderedType {
  return { kind: "text", text, converted };
}

function unknownType(): RenderedType {
  return simpleType("unknown", false);
}

function methodType(): RenderedType {
  return {
    kind: "method",
    functionText: "(...args: unknown[]) => unknown",
    signatureText: "(...args: unknown[]): unknown",
    converted: true,
  };
}

function renderComment(comment: string, indent: string, newline: string): string {
  return comment
    .split(/\r?\n/)
    .map((line) => `${indent}${line.trimStart()}`)
    .join(newline);
}

function indentMultiline(text: string, indent: string, newline: string): string {
  return text.split(/\r?\n/).join(`${newline}${indent}`);
}

function renderTypeLiteral(members: InterfaceMember[], newline: string): string {
  if (members.length === 0) {
    return "{}";
  }

  const lines = ["{"];
  for (const member of members) {
    lines.push(renderInterfaceMember(member, "  ", newline));
  }
  lines.push("}");
  return lines.join(newline);
}

function renderTypeExpression(type: RenderedType, newline: string): string {
  switch (type.kind) {
    case "text":
      return type.text;
    case "method":
      return type.functionText;
    case "typeLiteral":
      return renderTypeLiteral(type.members, newline);
  }
}

function wrapForIndexedOrArray(type: RenderedType, newline: string): string {
  const rendered = renderTypeExpression(type, newline);
  if (type.kind === "method" || rendered.includes(" | ")) {
    return `(${rendered})`;
  }
  return rendered;
}

function renderInterfaceMember(member: InterfaceMember, indent: string, newline: string): string {
  const renderedComments = member.comments.map((comment) => renderComment(comment, indent, newline));
  const optionalSuffix = member.required ? "" : "?";
  const renderedLine = member.type.kind === "method"
    ? `${indent}${member.keyText}${optionalSuffix}${member.type.signatureText}`
    : `${indent}${member.keyText}${optionalSuffix}: ${indentMultiline(
        renderTypeExpression(member.type, newline),
        indent,
        newline,
      )}`;

  return renderedComments.length > 0
    ? `${renderedComments.join(newline)}${newline}${renderedLine}`
    : renderedLine;
}

function renderInterface(name: string, members: InterfaceMember[], newline: string): string {
  const lines = [`interface ${name} {`];
  for (const member of members) {
    lines.push(renderInterfaceMember(member, "  ", newline));
  }
  lines.push("}");
  return lines.join(newline);
}

function stripRequired(node: SgNode<TSX> | null): { node: SgNode<TSX> | null; required: boolean } {
  if (!node || node.kind() !== "member_expression") {
    return { node, required: false };
  }

  const property = node.field("property");
  if (property?.text() !== "isRequired") {
    return { node, required: false };
  }

  return { node: node.field("object"), required: true };
}

function isCustomValidator(node: SgNode<TSX> | null): boolean {
  return node?.kind() === "function_expression" || node?.kind() === "arrow_function";
}

function callArguments(node: SgNode<TSX>): SgNode<TSX>[] {
  return namedChildren(node.field("arguments"));
}

function convertEnumElement(node: SgNode<TSX>): string {
  switch (node.kind()) {
    case "string":
    case "number":
    case "true":
    case "false":
      return node.text();
    default:
      return "unknown";
  }
}

function analyzeObjectElements(objectNode: SgNode<TSX>, newline: string): ObjectElement[] {
  const elements: ObjectElement[] = [];
  let pendingComments: string[] = [];
  let pendingStart: number | null = null;

  for (const child of namedOrCommentChildren(objectNode)) {
    if (child.kind() === "comment") {
      pendingComments.push(child.text());
      pendingStart ??= child.range().start.index;
      continue;
    }

    if (child.kind() === "pair") {
      const member = convertPair(child, pendingComments, newline);
      elements.push({
        comments: pendingComments,
        converted: member.converted,
        kind: "pair",
        member,
        node: child,
        start: pendingStart ?? child.range().start.index,
      });
    } else if (child.kind() === "method_definition") {
      const name = child.field("name");
      if (name) {
        const member: InterfaceMember = {
          comments: pendingComments,
          converted: false,
          keyText: name.text(),
          required: false,
          type: unknownType(),
        };
        elements.push({
          comments: pendingComments,
          converted: false,
          kind: "method",
          member,
          node: child,
          start: pendingStart ?? child.range().start.index,
        });
      }
    } else if (child.kind() === "spread_element") {
      elements.push({
        comments: pendingComments,
        converted: false,
        kind: "spread",
        member: null,
        node: child,
        start: pendingStart ?? child.range().start.index,
      });
    }

    pendingComments = [];
    pendingStart = null;
  }

  return elements;
}

function convertPair(node: SgNode<TSX>, comments: string[], newline: string): InterfaceMember {
  const key = node.field("key");
  const value = node.field("value");
  const { node: strippedValue, required } = stripRequired(value);
  const type = convertPropType(strippedValue, newline);

  return {
    comments,
    converted: type.converted,
    keyText: key?.text() ?? "unknown",
    required,
    type,
  };
}

function convertPropType(node: SgNode<TSX> | null, newline: string): RenderedType {
  if (!node) {
    return unknownType();
  }

  if (isCustomValidator(node)) {
    return unknownType();
  }

  if (node.kind() === "member_expression") {
    switch (node.field("property")?.text()) {
      case "any":
        return simpleType("any");
      case "array":
        return simpleType("unknown[]");
      case "bool":
        return simpleType("boolean");
      case "element":
        return simpleType("React.ReactElement");
      case "elementType":
        return simpleType("React.ElementType");
      case "func":
        return methodType();
      case "node":
        return simpleType("React.ReactNode");
      case "number":
        return simpleType("number");
      case "object":
        return simpleType("object");
      case "string":
        return simpleType("string");
      case "symbol":
        return simpleType("symbol");
      default:
        return unknownType();
    }
  }

  if (node.kind() !== "call_expression") {
    return unknownType();
  }

  const callee = node.field("function");
  if (!callee || callee.kind() !== "member_expression") {
    return unknownType();
  }

  const name = callee.field("property")?.text();
  const args = callArguments(node);

  switch (name) {
    case "arrayOf": {
      const inner = stripRequired(args[0] ?? null).node;
      if (!inner || isCustomValidator(inner)) {
        return unknownType();
      }
      return simpleType(`${wrapForIndexedOrArray(convertPropType(inner, newline), newline)}[]`);
    }

    case "objectOf": {
      const inner = stripRequired(args[0] ?? null).node;
      if (!inner || isCustomValidator(inner)) {
        return unknownType();
      }
      return simpleType(`Record<string, ${renderTypeExpression(convertPropType(inner, newline), newline)}>`);
    }

    case "oneOf": {
      const firstArg = args[0];
      if (!firstArg || firstArg.kind() !== "array") {
        return simpleType("unknown[]");
      }
      return simpleType(namedChildren(firstArg).map(convertEnumElement).join(" | "));
    }

    case "oneOfType": {
      const firstArg = args[0];
      if (!firstArg || firstArg.kind() !== "array") {
        return unknownType();
      }

      return simpleType(
        namedChildren(firstArg)
          .map((element) => {
            const converted = convertPropType(stripRequired(element).node, newline);
            const rendered = renderTypeExpression(converted, newline);
            return converted.kind === "method" ? `(${rendered})` : rendered;
          })
          .join(" | "),
      );
    }

    case "instanceOf": {
      const firstArg = args[0];
      return firstArg ? simpleType(firstArg.text()) : unknownType();
    }

    case "shape":
    case "exact": {
      const firstArg = args[0];
      if (!firstArg || firstArg.kind() !== "object") {
        return unknownType();
      }

      return {
        kind: "typeLiteral",
        members: analyzeObjectElements(firstArg, newline)
          .map((element) => element.member)
          .filter((member): member is InterfaceMember => member !== null),
        converted: true,
      };
    }

    default:
      return unknownType();
  }
}

function isForwardRefCall(node: SgNode<TSX>): boolean {
  if (node.kind() !== "call_expression") {
    return false;
  }

  const callee = node.field("function");
  return (callee?.kind() === "identifier" && callee.text() === "forwardRef") ||
    (callee?.kind() === "member_expression" && callee.field("property")?.text() === "forwardRef");
}

function isMemoCall(node: SgNode<TSX>): boolean {
  if (node.kind() !== "call_expression") {
    return false;
  }

  const callee = node.field("function");
  return (callee?.kind() === "identifier" && callee.text() === "memo") ||
    (callee?.kind() === "member_expression" && callee.field("property")?.text() === "memo");
}

function extractComponentTarget(initializer: SgNode<TSX>, statement: SgNode<TSX>): ComponentTarget | null {
  if (initializer.kind() === "arrow_function" || initializer.kind() === "function_expression") {
    return {
      kind: "function",
      functionNode: initializer,
      scopeKey: nearestScopeKey(initializer),
      start: initializer.range().start.index,
      statement,
    };
  }

  if (!isForwardRefCall(initializer) && !isMemoCall(initializer)) {
    return null;
  }

  if (isForwardRefCall(initializer)) {
    return {
      kind: "forwardRef",
      callNode: initializer,
      scopeKey: nearestScopeKey(initializer),
      start: initializer.range().start.index,
      statement,
    };
  }

  const firstArg = callArguments(initializer)[0];
  if (firstArg && (firstArg.kind() === "arrow_function" || firstArg.kind() === "function_expression")) {
    return {
      kind: "function",
      functionNode: firstArg,
      scopeKey: nearestScopeKey(firstArg),
      start: firstArg.range().start.index,
      statement,
    };
  }

  return null;
}

function pushTarget(targets: Map<string, ComponentTarget[]>, name: string, target: ComponentTarget): void {
  const existing = targets.get(name) ?? [];
  existing.push(target);
  targets.set(name, existing);
}

function resolveTarget(
  componentName: string,
  referenceNode: SgNode<TSX>,
  targets: Map<string, ComponentTarget[]>,
): ComponentTarget | null {
  const candidates = targets.get(componentName) ?? [];
  if (candidates.length === 0) {
    return null;
  }

  const referenceScopes = scopeChain(referenceNode);
  const referenceStart = referenceNode.range().start.index;

  const ranked = candidates
    .filter((candidate) => candidate.start <= referenceStart)
    .map((candidate) => ({
      candidate,
      scopeDepth: referenceScopes.indexOf(candidate.scopeKey),
    }))
    .filter((candidate) => candidate.scopeDepth !== -1)
    .sort((left, right) =>
      left.scopeDepth - right.scopeDepth || right.candidate.start - left.candidate.start
    );

  const firstRanked = ranked[0];
  if (firstRanked) {
    return firstRanked.candidate;
  }

  return candidates
    .filter((candidate) => candidate.start <= referenceStart)
    .sort((left, right) => right.start - left.start)[0] ?? null;
}

function collectComponentTargets(rootNode: SgNode<TSX, "program">): Map<string, ComponentTarget[]> {
  const targets = new Map<string, ComponentTarget[]>();

  for (const fn of rootNode.findAll({ rule: { kind: "function_declaration" } })) {
    const name = fn.field("name");
    if (!name) {
      continue;
    }

    pushTarget(targets, name.text(), {
      kind: "function",
      functionNode: fn,
      scopeKey: nearestScopeKey(fn),
      start: fn.range().start.index,
      statement: topLevelStatement(fn),
    });
  }

  for (const cls of rootNode.findAll({ rule: { kind: "class_declaration" } })) {
    const name = cls.field("name");
    if (!name) {
      continue;
    }

    pushTarget(targets, name.text(), {
      kind: "class",
      classNode: cls,
      scopeKey: nearestScopeKey(cls),
      start: cls.range().start.index,
      statement: topLevelStatement(cls),
    });
  }

  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (!name || name.kind() !== "identifier" || !value) {
      continue;
    }

    const target = extractComponentTarget(value, topLevelStatement(declarator));
    if (target) {
      pushTarget(targets, name.text(), target);
    }
  }

  return targets;
}

function collectPropTypesEntries(
  rootNode: SgNode<TSX, "program">,
  targets: Map<string, ComponentTarget[]>,
  newline: string,
): PropTypesEntry[] {
  const entries: PropTypesEntry[] = [];

  for (const assignment of rootNode.findAll({ rule: { kind: "assignment_expression" } })) {
    const left = assignment.field("left");
    const right = assignment.field("right");
    if (
      left?.kind() !== "member_expression" ||
      left.field("property")?.text() !== "propTypes" ||
      left.field("object")?.kind() !== "identifier"
    ) {
      continue;
    }

    const componentName = left.field("object")?.text();
    if (!componentName) {
      continue;
    }

    entries.push({
      componentName,
      container: enclosingStatement(assignment),
      elements: right?.kind() === "object" ? analyzeObjectElements(right, newline) : [],
      kind: "assignment",
      objectNode: right?.kind() === "object" ? right : null,
      target: resolveTarget(componentName, assignment, targets),
    });
  }

  for (const field of rootNode.findAll({ rule: { kind: "public_field_definition" } })) {
    if (!field.text().startsWith("static ") || field.field("name")?.text() !== "propTypes") {
      continue;
    }

    const classDeclaration = field.ancestors().find((ancestor) => ancestor.kind() === "class_declaration");
    const componentName = classDeclaration?.field("name")?.text();
    const value = field.field("value");
    if (!classDeclaration || !componentName) {
      continue;
    }

    entries.push({
      componentName,
      container: field,
      elements: value?.kind() === "object" ? analyzeObjectElements(value, newline) : [],
      kind: "static",
      objectNode: value?.kind() === "object" ? value : null,
      target: resolveTarget(componentName, field, targets),
    });
  }

  return entries;
}

function parameterNodes(functionNode: SgNode<TSX>): SgNode<TSX>[] {
  return namedChildren(functionNode.field("parameters"));
}

function hasTypeAnnotation(parameterNode: SgNode<TSX> | null): boolean {
  return parameterNode?.children().some((child) => child.kind() === "type_annotation") ?? false;
}

function functionAnnotationEdit(functionNode: SgNode<TSX>, typeName: string): Edit | null {
  const firstParameter = parameterNodes(functionNode)[0];
  if (!firstParameter || hasTypeAnnotation(firstParameter)) {
    return null;
  }

  const end = firstParameter.range().end.index;
  return { startPos: end, endPos: end, insertedText: `: ${typeName}` };
}

function classTypeArgumentEdit(classNode: SgNode<TSX>, typeName: string): Edit | null {
  const heritage = classNode.children().find((child) => child.kind() === "class_heritage");
  if (!heritage || heritage.find({ rule: { kind: "type_arguments" } })) {
    return null;
  }

  const reactComponentMember = heritage.find({
    rule: {
      kind: "member_expression",
      has: {
        kind: "property_identifier",
        regex: "^(Pure)?Component$",
      },
    },
  });
  const componentIdentifier = heritage.find({
    rule: {
      kind: "identifier",
      regex: "^(Pure)?Component$",
    },
  });
  const insertionNode = reactComponentMember ?? componentIdentifier;
  if (!insertionNode) {
    return null;
  }

  const end = insertionNode.range().end.index;
  return { startPos: end, endPos: end, insertedText: `<${typeName}>` };
}

function forwardRefEdit(callNode: SgNode<TSX>, typeName: string): Edit | null {
  if (callNode.children().some((child) => child.kind() === "type_arguments")) {
    return null;
  }

  const callee = callNode.field("function");
  if (!callee) {
    return null;
  }

  const end = callee.range().end.index;
  return { startPos: end, endPos: end, insertedText: `<HTMLElement, ${typeName}>` };
}

function collectExistingTypeNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const declaration of rootNode.findAll({ rule: { kind: "interface_declaration" } })) {
    const name = declaration.field("name");
    if (name) {
      names.add(name.text());
    }
  }

  for (const declaration of rootNode.findAll({ rule: { kind: "type_alias_declaration" } })) {
    const name = declaration.field("name");
    if (name) {
      names.add(name.text());
    }
  }

  return names;
}

function targetAlreadyTyped(target: ComponentTarget): boolean {
  switch (target.kind) {
    case "function":
      return hasTypeAnnotation(parameterNodes(target.functionNode)[0] ?? null);
    case "class": {
      const heritage = target.classNode.children().find((child) => child.kind() === "class_heritage");
      return Boolean(heritage?.find({ rule: { kind: "type_arguments" } }));
    }
    case "forwardRef":
      return target.callNode.children().some((child) => child.kind() === "type_arguments");
  }
}

function interfaceInsertionEdit(
  statement: SgNode<TSX>,
  typeName: string,
  members: InterfaceMember[],
  source: string,
  newline: string,
): Edit {
  const start = statement.range().start.index;
  const indent = lineIndentAt(source, start);
  const rendered = renderInterface(typeName, members, newline)
    .split(/\r?\n/)
    .map((line) => `${indent}${line}`)
    .join(newline);

  return { startPos: start, endPos: start, insertedText: `${rendered}${newline}${newline}` };
}

function collectPropTypesImports(rootNode: SgNode<TSX, "program">): Array<{ localName: string }> {
  const imports: Array<{ localName: string }> = [];

  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== "prop-types") {
      continue;
    }

    const importClause = importNode.find({ rule: { kind: "import_clause" } });
    const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");
    if (defaultIdentifier) {
      imports.push({ localName: defaultIdentifier.text() });
    }

    for (const specifier of importNode.findAll({ rule: { kind: "import_specifier" } })) {
      const localName = specifier.field("alias")?.text() ?? specifier.field("name")?.text();
      if (localName) {
        imports.push({ localName });
      }
    }
  }

  return imports;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanupPropTypesImports(source: string, imports: Array<{ localName: string }>): string {
  if (imports.length === 0) {
    return source;
  }

  const sourceWithoutImports = source
    .split(/\r?\n/)
    .filter((line) => !/^\s*import .* from ['"]prop-types['"]\s*;?\s*$/.test(line))
    .join("\n");

  const hasRemainingUsage = imports.some(({ localName }) =>
    new RegExp(`\\b${escapeRegExp(localName)}\\s*\\.`, "m").test(sourceWithoutImports)
  );
  if (hasRemainingUsage) {
    return source;
  }

  return source
    .replace(/^\s*import .* from ['"]prop-types['"]\s*;?\r?\n?/gm, "")
    .replace(/^\s*\r?\n/, "");
}

function preserveModeFromOptions(rawValue: unknown): PreserveMode {
  if (rawValue === true || rawValue === "all") {
    return "all";
  }
  if (rawValue === "unconverted") {
    return "unconverted";
  }
  return "none";
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const newline = guessNewline(source);
  const preserveMode = preserveModeFromOptions(options.params?.["preserve-prop-types"]);
  const metric = useMetricAtom("prop-types-typescript-conversions");
  const imports = collectPropTypesImports(rootNode);
  const existingTypeNames = collectExistingTypeNames(rootNode);
  const targets = collectComponentTargets(rootNode);
  const entries = collectPropTypesEntries(rootNode, targets, newline);

  if (entries.length === 0) {
    return null;
  }

  const edits: Edit[] = [];
  const handledTargets = new Set<string>();

  for (const entry of entries) {
    const members = entry.elements
      .map((element) => element.member)
      .filter((member): member is InterfaceMember => member !== null);
    const typeName = `${entry.componentName}Props`;
    const handleKey = entry.target
      ? `${entry.componentName}:${entry.target.scopeKey}:${entry.target.start}`
      : `${entry.componentName}:${entry.container.range().start.index}`;

    if (entry.target && members.length > 0 && !handledTargets.has(handleKey)) {
      const alreadyTyped = targetAlreadyTyped(entry.target);
      const hasExistingType = existingTypeNames.has(typeName);

      if (!alreadyTyped && !hasExistingType) {
        edits.push(interfaceInsertionEdit(entry.target.statement, typeName, members, source, newline));
      }

      if (!alreadyTyped) {
        switch (entry.target.kind) {
          case "function": {
            const edit = functionAnnotationEdit(entry.target.functionNode, typeName);
            if (edit) {
              edits.push(edit);
            }
            break;
          }
          case "class": {
            const edit = classTypeArgumentEdit(entry.target.classNode, typeName);
            if (edit) {
              edits.push(edit);
            }
            break;
          }
          case "forwardRef": {
            const edit = forwardRefEdit(entry.target.callNode, typeName);
            if (edit) {
              edits.push(edit);
            }
            break;
          }
        }
      }

      handledTargets.add(handleKey);
      metric.increment({ file: metricFile(root.filename()), component: entry.componentName });
    }

    if (preserveMode === "all") {
      continue;
    }

    if (!entry.objectNode) {
      if (preserveMode === "none") {
        const range = entry.kind === "assignment"
          ? statementRange(entry.container, source)
          : classMemberRange(entry.container, source);
        edits.push({ startPos: range.start, endPos: range.end, insertedText: "" });
      }
      continue;
    }

    if (preserveMode === "none") {
      const range = entry.kind === "assignment"
        ? statementRange(entry.container, source)
        : classMemberRange(entry.container, source);
      edits.push({ startPos: range.start, endPos: range.end, insertedText: "" });
      continue;
    }

    const preserved = entry.elements.filter((element) =>
      element.kind === "spread" || element.member?.converted === false
    );
    if (preserved.length === 0) {
      const range = entry.kind === "assignment"
        ? statementRange(entry.container, source)
        : classMemberRange(entry.container, source);
      edits.push({ startPos: range.start, endPos: range.end, insertedText: "" });
      continue;
    }

    for (const element of entry.elements) {
      if (element.kind !== "spread" && element.member?.converted) {
        edits.push(removeObjectElementWithComma(element, source));
      }
    }
  }

  if (edits.length === 0) {
    return null;
  }

  const rewritten = cleanupPropTypesImports(rootNode.commitEdits(edits), imports);
  if (rewritten === source) {
    return null;
  }

  return rewritten;
};

export default transform;
