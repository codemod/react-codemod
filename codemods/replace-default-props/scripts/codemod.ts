import type { Edit, SgNode, Transform } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

type DefaultProp = {
  key: string;
  value: SgNode<TSX>;
};

type ComponentTarget = {
  name: string;
  functionNode: SgNode<TSX>;
  statementNode: SgNode<TSX>;
};

type DefaultPropsEntry = {
  componentName: string;
  statementNode: SgNode<TSX>;
  objectNode: SgNode<TSX>;
};

type TransformPlan = {
  edits: Edit[];
  replacementCount: number;
};

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

function isCapitalized(name: string): boolean {
  const first = name[0];
  return first !== undefined && first.toUpperCase() === first;
}

function lineStart(source: string, index: number): number {
  let cursor = index;
  while (cursor > 0 && source[cursor - 1] !== "\n" && source[cursor - 1] !== "\r") {
    cursor--;
  }
  return cursor;
}

function consumeLineBreak(source: string, index: number): number {
  if (source[index] === "\r" && source[index + 1] === "\n") {
    return index + 2;
  }

  if (source[index] === "\n" || source[index] === "\r") {
    return index + 1;
  }

  return index;
}

function consumeBlankLine(source: string, index: number): number {
  let cursor = index;
  while (cursor < source.length && (source[cursor] === " " || source[cursor] === "\t")) {
    cursor++;
  }

  if (source[cursor] !== "\n" && source[cursor] !== "\r") {
    return index;
  }

  return consumeLineBreak(source, cursor);
}

function removeStatementEdit(source: string, statement: SgNode<TSX>): Edit {
  const range = statement.range();
  const start = lineStart(source, range.start.index);
  let end = consumeLineBreak(source, range.end.index);
  end = consumeBlankLine(source, end);

  return {
    startPos: start,
    endPos: end,
    insertedText: "",
  };
}

function enclosingStatement(node: SgNode<TSX>): SgNode<TSX> {
  return node.ancestors().find((ancestor) =>
    ancestor.kind() === "lexical_declaration" ||
    ancestor.kind() === "function_declaration" ||
    ancestor.kind() === "expression_statement" ||
    ancestor.kind() === "export_statement"
  ) ?? node;
}

function topLevelStatement(node: SgNode<TSX>): SgNode<TSX> {
  let current: SgNode<TSX> = node;
  let parent = current.parent();
  while (parent && parent.kind() !== "program") {
    current = parent;
    parent = parent.parent();
  }

  return current;
}

function collectComponentTargets(rootNode: SgNode<TSX, "program">): Map<string, ComponentTarget[]> {
  const targets = new Map<string, ComponentTarget[]>();

  const addTarget = (target: ComponentTarget): void => {
    if (!isCapitalized(target.name)) {
      return;
    }

    const entries = targets.get(target.name) ?? [];
    entries.push(target);
    targets.set(target.name, entries);
  };

  for (const fn of rootNode.findAll({ rule: { kind: "function_declaration" } })) {
    const name = fn.field("name")?.text();
    if (!name) {
      continue;
    }

    addTarget({
      name,
      functionNode: fn,
      statementNode: topLevelStatement(fn),
    });
  }

  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name?.kind() !== "identifier" || !value) {
      continue;
    }

    if (value.kind() !== "arrow_function" && value.kind() !== "function_expression") {
      continue;
    }

    addTarget({
      name: name.text(),
      functionNode: value,
      statementNode: topLevelStatement(declarator),
    });
  }

  for (const fn of rootNode.findAll({ rule: { kind: "function_expression" } })) {
    const name = fn.field("name")?.text();
    if (!name) {
      continue;
    }

    addTarget({
      name,
      functionNode: fn,
      statementNode: topLevelStatement(fn),
    });
  }

  return targets;
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

  const referenceStart = referenceNode.range().start.index;
  return candidates
    .filter((candidate) => candidate.statementNode.range().start.index <= referenceStart)
    .sort((left, right) => right.statementNode.range().start.index - left.statementNode.range().start.index)[0] ?? candidates[0] ?? null;
}

function collectDefaultPropsEntries(rootNode: SgNode<TSX, "program">): DefaultPropsEntry[] {
  const entries: DefaultPropsEntry[] = [];

  for (const assignment of rootNode.findAll({ rule: { kind: "assignment_expression" } })) {
    const left = assignment.field("left");
    const right = assignment.field("right");
    if (
      left?.kind() !== "member_expression" ||
      right?.kind() !== "object" ||
      left.field("property")?.text() !== "defaultProps" ||
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
      statementNode: enclosingStatement(assignment),
      objectNode: right,
    });
  }

  return entries;
}

function defaultPropsFromObject(objectNode: SgNode<TSX>): DefaultProp[] {
  const props: DefaultProp[] = [];

  for (const pair of namedChildren(objectNode)) {
    if (pair.kind() !== "pair") {
      continue;
    }

    const key = pair.field("key");
    const value = pair.field("value");
    if (!key || !value || (key.kind() !== "property_identifier" && key.kind() !== "identifier")) {
      continue;
    }

    props.push({ key: key.text(), value });
  }

  return props;
}

function constNameFor(componentName: string, propName: string): string {
  return `${componentName[0]?.toLowerCase() ?? ""}${componentName.slice(1)}DefaultProp${propName[0]?.toUpperCase() ?? ""}${propName.slice(1)}`;
}

function shouldHoistDefaultValue(value: SgNode<TSX>): boolean {
  return value.kind() === "object" || value.kind() === "array" || value.kind() === "arrow_function";
}

function identifierExists(rootNode: SgNode<TSX, "program">, name: string): boolean {
  return rootNode.findAll({ rule: { kind: "identifier" } }).some((identifier) => identifier.text() === name);
}

function buildDefaultValueText(
  rootNode: SgNode<TSX, "program">,
  componentName: string,
  prop: DefaultProp,
  hoistedDeclarations: string[],
): string {
  if (!shouldHoistDefaultValue(prop.value)) {
    return prop.value.text();
  }

  const constName = constNameFor(componentName, prop.key);
  if (!identifierExists(rootNode, constName)) {
    hoistedDeclarations.push(`const ${constName} = ${prop.value.text()};`);
  }

  return constName;
}

function parameterNodes(functionNode: SgNode<TSX>): SgNode<TSX>[] {
  const params = functionNode.field("parameters");
  if (params) {
    return namedChildren(params);
  }

  return functionNode.kind() === "arrow_function"
    ? namedChildren(functionNode).filter((child) => child.kind() === "identifier").slice(0, 1)
    : [];
}

function parameterPattern(parameter: SgNode<TSX> | null): SgNode<TSX> | null {
  if (!parameter) {
    return null;
  }

  if (parameter.kind() === "identifier" || parameter.kind() === "object_pattern") {
    return parameter;
  }

  return namedChildren(parameter)[0] ?? null;
}

function propertyKey(patternProperty: SgNode<TSX>): string | null {
  if (patternProperty.kind() === "shorthand_property_identifier_pattern") {
    return patternProperty.text();
  }

  if (patternProperty.kind() !== "pair_pattern") {
    return null;
  }

  return patternProperty.field("key")?.text() ?? null;
}

function propertyValue(patternProperty: SgNode<TSX>): SgNode<TSX> | null {
  if (patternProperty.kind() === "shorthand_property_identifier_pattern") {
    return patternProperty;
  }

  return patternProperty.field("value");
}

function isAlreadyDefaulted(patternProperty: SgNode<TSX>): boolean {
  if (patternProperty.kind() === "assignment_pattern") {
    return true;
  }

  return propertyValue(patternProperty)?.kind() === "assignment_pattern";
}

function buildPatternReplacement(patternProperty: SgNode<TSX>, defaultValueText: string): string | null {
  if (isAlreadyDefaulted(patternProperty)) {
    return null;
  }

  if (patternProperty.kind() === "shorthand_property_identifier_pattern") {
    return `${patternProperty.text()} = ${defaultValueText}`;
  }

  if (patternProperty.kind() !== "pair_pattern") {
    return null;
  }

  const key = patternProperty.field("key");
  const value = patternProperty.field("value");
  if (!key || !value) {
    return null;
  }

  return `${key.text()}: ${value.text()} = ${defaultValueText}`;
}

function bodyStatementIndent(source: string, body: SgNode<TSX>): string {
  const bodyStart = body.range().start.index;
  const afterOpeningBrace = bodyStart + 1;
  let cursor = afterOpeningBrace;
  while (cursor < source.length && (source[cursor] === "\r" || source[cursor] === "\n")) {
    cursor++;
  }

  const firstStatementLineStart = lineStart(source, cursor);
  let firstNonWhitespace = firstStatementLineStart;
  while (firstNonWhitespace < source.length && (source[firstNonWhitespace] === " " || source[firstNonWhitespace] === "\t")) {
    firstNonWhitespace++;
  }

  const indent = source.slice(firstStatementLineStart, firstNonWhitespace);
  if (indent.length > 0) {
    return indent;
  }

  const bodyLineStart = lineStart(source, bodyStart);
  return `${source.slice(bodyLineStart, bodyStart)}  `;
}

function propsAssignmentText(propsArgName: string, inlineDefaultProps: Array<{ key: string; valueText: string }>, indent: string): string {
  const innerIndent = `${indent}  `;
  const lines = [
    `${indent}${propsArgName} = {`,
    `${innerIndent}...${propsArgName},`,
    ...inlineDefaultProps.map(({ key, valueText }, index) => {
      const comma = index === inlineDefaultProps.length - 1 ? "" : ",";
      return `${innerIndent}${key}: typeof ${propsArgName}.${key} === "undefined" ? ${valueText} : ${propsArgName}.${key}${comma}`;
    }),
    `${indent}};`,
    "",
  ];

  return lines.join("\n");
}

function bodyInsertionEdit(source: string, body: SgNode<TSX>, insertedText: string): Edit {
  const insertPos = body.range().start.index + 1;
  const existingNewline = source[insertPos] === "\r" && source[insertPos + 1] === "\n"
    ? "\r\n"
    : "\n";

  return {
    startPos: insertPos,
    endPos: insertPos,
    insertedText: `${existingNewline}${insertedText}`,
  };
}

function transformEntry(
  rootNode: SgNode<TSX, "program">,
  source: string,
  entry: DefaultPropsEntry,
  target: ComponentTarget,
): TransformPlan | null {
  const props = defaultPropsFromObject(entry.objectNode);
  if (props.length === 0) {
    return null;
  }

  const firstParam = parameterNodes(target.functionNode)[0] ?? null;
  const firstPattern = parameterPattern(firstParam);
  if (!firstPattern) {
    return null;
  }

  const hoistedDeclarations: string[] = [];
  const defaultValueByKey = new Map<string, string>();
  for (const prop of props) {
    defaultValueByKey.set(prop.key, buildDefaultValueText(rootNode, target.name, prop, hoistedDeclarations));
  }

  const edits: Edit[] = [];
  let propsArgName: string | null = null;
  const inlineDefaults: Array<{ key: string; valueText: string }> = [];
  let replacementCount = 0;

  if (firstPattern.kind() === "object_pattern") {
    const usedKeys = new Set<string>();

    for (const property of namedChildren(firstPattern)) {
      if (property.kind() === "rest_pattern") {
        const restName = property.find({ rule: { kind: "identifier" } })?.text() ?? null;
        propsArgName = restName;
        continue;
      }

      const key = propertyKey(property);
      if (!key || !defaultValueByKey.has(key)) {
        continue;
      }

      const defaultValueText = defaultValueByKey.get(key);
      if (!defaultValueText) {
        continue;
      }

      const replacement = buildPatternReplacement(property, defaultValueText);
      if (!replacement) {
        return null;
      }

      edits.push(property.replace(replacement));
      usedKeys.add(key);
      replacementCount++;
    }

    if (propsArgName) {
      for (const [key, valueText] of defaultValueByKey) {
        if (!usedKeys.has(key)) {
          inlineDefaults.push({ key, valueText });
          replacementCount++;
        }
      }
    }
  } else if (firstPattern.kind() === "identifier") {
    propsArgName = firstPattern.text();
    for (const [key, valueText] of defaultValueByKey) {
      inlineDefaults.push({ key, valueText });
      replacementCount++;
    }
  }

  if (inlineDefaults.length > 0) {
    const body = target.functionNode.field("body");
    if (!body || body.kind() !== "statement_block" || !propsArgName) {
      return null;
    }

    edits.push(bodyInsertionEdit(
      source,
      body,
      propsAssignmentText(propsArgName, inlineDefaults, bodyStatementIndent(source, body)),
    ));
  }

  if (replacementCount === 0) {
    return null;
  }

  if (hoistedDeclarations.length > 0) {
    edits.push({
      startPos: lineStart(source, target.statementNode.range().start.index),
      endPos: lineStart(source, target.statementNode.range().start.index),
      insertedText: `${hoistedDeclarations.join("\n")}\n`,
    });
  }

  edits.push(removeStatementEdit(source, entry.statementNode));

  return {
    edits,
    replacementCount,
  };
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const targets = collectComponentTargets(rootNode);
  const entries = collectDefaultPropsEntries(rootNode);
  const edits: Edit[] = [];
  const metric = useMetricAtom("replace-default-props-replacements");
  let replacementCount = 0;

  for (const entry of entries) {
    const target = resolveTarget(entry.componentName, entry.statementNode, targets);
    if (!target) {
      continue;
    }

    const plan = transformEntry(rootNode, source, entry, target);
    if (!plan) {
      continue;
    }

    edits.push(...plan.edits);
    replacementCount += plan.replacementCount;
  }

  if (edits.length === 0) {
    return null;
  }

  metric.increment({ file: metricFile(root.filename()) }, replacementCount);
  return rootNode.commitEdits(edits);
};

export default transform;
