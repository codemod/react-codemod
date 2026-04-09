import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
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

function selectorMatches(selector: string, name: string, isStatic: boolean): boolean {
  if (selector === "static-methods") return isStatic;
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

function correctIndex(order: string[], chunk: MemberChunk): number {
  const everythingElse = order.indexOf("everything-else");
  const isStatic = chunk.node.text().startsWith("static ");
  for (let i = 0; i < order.length; i++) {
    if (i !== everythingElse && selectorMatches(order[i]!, chunk.name, isStatic)) return i;
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

function createClassConfig(call: SgNode<TSX>): SgNode<TSX> | null {
  const args = call.field("arguments");
  if (!args) return null;
  return args.children().find((child) => child.kind() === "object") ?? null;
}

function isCreateClassCall(call: SgNode<TSX>): boolean {
  const fn = call.field("function");
  if (!fn) return false;
  if (fn.kind() === "identifier") return fn.text() === "createClass";
  return fn.kind() === "member_expression" && fn.field("property")?.text() === "createClass";
}

function isReactClass(node: SgNode<TSX>): boolean {
  const heritage = node.find({ rule: { kind: "class_heritage" } });
  if (!heritage) return false;
  return heritage.findAll({ rule: { kind: "identifier" } })
    .some((id) => id.text() === "Component" || id.text() === "PureComponent" || id.text() === "React");
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
  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("sort-comp-reorders");
  const methodsOrderParam = options.params?.methodsOrder as unknown;
  const methodsOrder = Array.isArray(methodsOrderParam)
    ? methodsOrderParam.filter((item): item is string => typeof item === "string")
    : DEFAULT_METHODS_ORDER;

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (!isCreateClassCall(call)) continue;
    const config = createClassConfig(call);
    if (!config) continue;
    const edit = replacementFor(config, collectChunks(config, source), methodsOrder, ",\n\n  ");
    if (edit) {
      edits.push(edit);
      metric.increment({ file: metricFile(root.filename()), kind: "createClass" });
    }
  }

  for (const classDecl of rootNode.findAll({ rule: { kind: "class_declaration" } })) {
    if (!isReactClass(classDecl)) continue;
    const body = classDecl.find({ rule: { kind: "class_body" } });
    if (!body) continue;
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
