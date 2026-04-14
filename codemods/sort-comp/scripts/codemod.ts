import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

type ReactImportAliases = {
  component: Set<string>;
  pureComponent: Set<string>;
};

type ReactSuperclassKind = "Component" | "PureComponent";

const REACT_SOURCES = new Set(["react", "React", "react/addons", "react-native"]);

function stringValue(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  const args = call.field("arguments");
  if (!args) return [];
  return args.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function requireSource(call: SgNode<TSX>): string | null {
  const callee = call.field("function");
  if (!callee || callee.kind() !== "identifier" || callee.text() !== "require") return null;
  const firstArg = callArguments(call)[0];
  return firstArg?.kind() === "string" ? stringValue(firstArg) : null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? stringValue(source) : null;
}

function isReactSource(importStmt: SgNode<TSX>): boolean {
  return REACT_SOURCES.has(importSource(importStmt) ?? "");
}

function hasReact(rootNode: SgNode<TSX, "program">): boolean {
  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (isReactSource(importNode)) return true;
  }

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (REACT_SOURCES.has(requireSource(call) ?? "")) return true;
  }

  return false;
}

function explicitRequireDisabled(value: unknown): boolean {
  return value === false || value === "false";
}

function reactImportAliases(rootNode: SgNode<TSX>): ReactImportAliases {
  const component = new Set<string>();
  const pureComponent = new Set<string>();

  for (const importStmt of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (!isReactSource(importStmt)) continue;

    for (const specifier of importStmt.findAll({ rule: { kind: "import_specifier" } })) {
      const imported = specifier.field("name")?.text();
      const alias = specifier.field("alias")?.text() ?? imported;
      if (!imported || !alias) continue;
      if (imported === "Component") component.add(alias);
      if (imported === "PureComponent") pureComponent.add(alias);
    }
  }

  return { component, pureComponent };
}

function reactSuperclassKind(
  classDecl: SgNode<TSX>,
  aliases: ReactImportAliases,
): ReactSuperclassKind | null {
  const heritage = classDecl.find({ rule: { kind: "class_heritage" } });
  if (!heritage) return null;

  const directExtends = heritage.find({
    rule: { any: [{ kind: "member_expression" }, { kind: "identifier" }] },
  });
  if (!directExtends) return null;

  if (directExtends.kind() === "member_expression") {
    const object = directExtends.field("object");
    const property = directExtends.field("property")?.text() ?? "";
    if (object?.text() !== "React") return null;
    if (property === "Component" || property === "PureComponent") return property;
    return null;
  }

  const name = directExtends.text();
  if (aliases.component.has(name)) return "Component";
  if (aliases.pureComponent.has(name)) return "PureComponent";
  return null;
}

function isReactCreateClassCall(node: SgNode<TSX> | null): node is SgNode<TSX> {
  if (!node || node.kind() !== "call_expression") return false;
  const callee = node.field("function");
  return callee?.kind() === "member_expression" &&
    callee.field("object")?.kind() === "identifier" &&
    callee.field("object")?.text() === "React" &&
    callee.field("property")?.kind() === "property_identifier" &&
    callee.field("property")?.text() === "createClass";
}

function reactCreateClassConfigs(rootNode: SgNode<TSX, "program">): SgNode<TSX>[] {
  const configs: SgNode<TSX>[] = [];
  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const value = declarator.field("value");
    if (!isReactCreateClassCall(value)) continue;
    const args = value.field("arguments");
    const config = args?.children().find((child) => child.kind() === "object");
    if (config) configs.push(config);
  }
  return configs;
}

function reactClassBodies(rootNode: SgNode<TSX, "program">): SgNode<TSX>[] {
  const aliases = reactImportAliases(rootNode);
  const reactClasses = rootNode.findAll({ rule: { kind: "class_declaration" } })
    .map((classDecl) => ({ classDecl, kind: reactSuperclassKind(classDecl, aliases) }))
    .filter((entry): entry is { classDecl: SgNode<TSX>; kind: ReactSuperclassKind } => entry.kind !== null);
  const targetSuperclassKind = reactClasses.some((entry) => entry.kind === "Component")
    ? "Component"
    : reactClasses.some((entry) => entry.kind === "PureComponent")
      ? "PureComponent"
      : null;

  if (!targetSuperclassKind) return [];
  return reactClasses
    .filter((entry) => entry.kind === targetSuperclassKind)
    .map((entry) => entry.classDecl.find({ rule: { kind: "class_body" } }))
    .filter((body): body is SgNode<TSX> => body !== null);
}


type MemberChunk = {
  node: SgNode<TSX>;
  name: string;
  text: string;
  start: number;
  end: number;
  originalIndex: number;
};

const DEFAULT_METHODS_ORDER = [
  "static-methods",
  "displayName",
  "propTypes",
  "contextTypes",
  "childContextTypes",
  "mixins",
  "statics",
  "defaultProps",
  "constructor",
  "getDefaultProps",
  "state",
  "getInitialState",
  "getChildContext",
  "getDerivedStateFromProps",
  "componentWillMount",
  "UNSAFE_componentWillMount",
  "componentDidMount",
  "componentWillReceiveProps",
  "UNSAFE_componentWillReceiveProps",
  "shouldComponentUpdate",
  "componentWillUpdate",
  "UNSAFE_componentWillUpdate",
  "getSnapshotBeforeUpdate",
  "componentDidUpdate",
  "componentDidCatch",
  "componentWillUnmount",
  "/^on.+$/",
  "/^(get|set)(?!(InitialState$|DefaultProps$|ChildContext$)).+$/",
  "everything-else",
  "/^render.+$/",
  "render",
];

function isTypeAnnotationMember(node: SgNode<TSX>): boolean {
  return node.kind() === "public_field_definition" &&
    node.field("value") === null &&
    node.find({ rule: { kind: "type_annotation" } }) !== null;
}

function selectorMatches(selector: string, name: string, isStatic: boolean): boolean {
  if (selector === "static-methods") return isStatic;
  if (selector === "type-annotations") return false;
  if (selector === name) return true;
  if (selector.startsWith("/") && selector.lastIndexOf("/") > 0) {
    const lastSlash = selector.lastIndexOf("/");
    const body = selector.slice(1, lastSlash);
    const flags = selector.slice(lastSlash + 1);
    try {
      return new RegExp(body, flags).test(name);
    } catch {
      return false;
    }
  }
  return false;
}

function chunkMatchesSelector(selector: string, chunk: MemberChunk): boolean {
  if (selector === "type-annotations") return isTypeAnnotationMember(chunk.node);
  return selectorMatches(selector, chunk.name, chunk.node.text().startsWith("static "));
}

function correctIndex(order: string[], chunk: MemberChunk): number {
  const everythingElse = order.indexOf("everything-else");
  for (let i = 0; i < order.length; i++) {
    if (i !== everythingElse && chunkMatchesSelector(order[i]!, chunk)) return i;
  }
  return everythingElse >= 0 ? everythingElse : Number.POSITIVE_INFINITY;
}

function memberName(node: SgNode<TSX>): string {
  if (node.kind() === "method_definition" || node.kind() === "public_field_definition") {
    return node.field("name")?.text() ?? "";
  }
  return node.field("key")?.text() ?? "";
}

function significantChildren(container: SgNode<TSX>): SgNode<TSX>[] {
  return container.children()
    .filter((child) =>
      child.kind() === "comment" ||
      child.kind() === "pair" ||
      child.kind() === "method_definition" ||
      child.kind() === "public_field_definition"
    )
    .sort((a, b) => a.range().start.index - b.range().start.index);
}

function collectChunks(container: SgNode<TSX>, source: string): MemberChunk[] {
  const chunks: MemberChunk[] = [];
  let leadingStart: number | null = null;

  for (const child of significantChildren(container)) {
    if (child.kind() === "comment") {
      if (leadingStart === null) leadingStart = child.range().start.index;
      continue;
    }
    const start = leadingStart ?? child.range().start.index;
    const end = child.range().end.index;
    chunks.push({
      node: child,
      name: memberName(child),
      text: source.slice(start, end).trim(),
      start,
      end,
      originalIndex: chunks.length,
    });
    leadingStart = null;
  }

  return chunks;
}

function sortChunks(chunks: MemberChunk[], order: string[]): MemberChunk[] {
  return [...chunks].sort((a, b) => {
    const indexA = correctIndex(order, a);
    const indexB = correctIndex(order, b);
    if (indexA !== indexB) return indexA - indexB;
    const nameCompare = a.name.localeCompare(b.name);
    return nameCompare !== 0 ? nameCompare : a.originalIndex - b.originalIndex;
  });
}

function replacementFor(container: SgNode<TSX>, chunks: MemberChunk[], order: string[], sep: string): Edit | null {
  if (chunks.length <= 1) return null;
  const sorted = sortChunks(chunks, order);
  const changed = sorted.some((chunk, index) => chunk.originalIndex !== index);
  if (!changed) return null;
  return {
    startPos: chunks[0]!.start,
    endPos: chunks[chunks.length - 1]!.end,
    insertedText: sorted.map((chunk) => chunk.text).join(sep),
  };
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  if (!explicitRequireDisabled(options.params?.["explicit-require"]) && !hasReact(rootNode)) {
    return null;
  }

  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("sort-comp-reorders");
  const methodsOrderParam = options.params?.methodsOrder as unknown;
  const methodsOrder = Array.isArray(methodsOrderParam)
    ? methodsOrderParam.filter((item): item is string => typeof item === "string")
    : DEFAULT_METHODS_ORDER;

  for (const config of reactCreateClassConfigs(rootNode)) {
    const edit = replacementFor(config, collectChunks(config, source), methodsOrder, ",\n\n  ");
    if (edit) {
      edits.push(edit);
      metric.increment({ file: metricFile(root.filename()), kind: "createClass" });
    }
  }

  for (const body of reactClassBodies(rootNode)) {
    const edit = replacementFor(body, collectChunks(body, source), methodsOrder, "\n\n  ");
    if (edit) {
      edits.push(edit);
      metric.increment({ file: metricFile(root.filename()), kind: "class" });
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
