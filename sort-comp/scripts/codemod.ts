import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

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

const REGEXP_REGEXP = /^\/(.*)\/([gimuy]*)$/;

function selectorMatches(selector: string, methodName: string): boolean {
  if (selector === methodName) return true;
  if (selector === "static-methods") return false;
  const reMatch = selector.match(REGEXP_REGEXP);
  if (reMatch) {
    try {
      const re = new RegExp(reMatch[1], reMatch[2]);
      return re.test(methodName);
    } catch {
      return false;
    }
  }
  return false;
}

function getCorrectIndex(methodsOrder: string[], methodName: string): number {
  const everythingElseIndex = methodsOrder.indexOf("everything-else");
  for (let i = 0; i < methodsOrder.length; i++) {
    if (i !== everythingElseIndex && selectorMatches(methodsOrder[i], methodName)) {
      return i;
    }
  }
  return everythingElseIndex >= 0 ? everythingElseIndex : Number.POSITIVE_INFINITY;
}

function getPairKeyName(node: SgNode<TSX>): string {
  if (node.kind() === "method_definition") {
    const name = node.field("name");
    return name ? name.text() : "";
  }
  const key = node.field("key");
  if (!key) return "";
  return key.text();
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];
  const methodsOrder = (options.params?.["methodsOrder"] as string[]) ?? DEFAULT_METHODS_ORDER;
  const metric = useMetricAtom("sort-comp-reorders");

  const createClassCalls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        any: [
          {
            kind: "member_expression",
            all: [
              { has: { field: "object", kind: "identifier", regex: "^React$" } },
              { has: { field: "property", kind: "property_identifier", regex: "^createClass$" } },
            ],
          },
          { kind: "identifier", regex: "^createClass$" },
        ],
      },
    },
  });

  for (const call of createClassCalls) {
    const args = call.field("arguments");
    if (!args) continue;
    const argList = args.children().filter(
      (c) => c.kind() !== "(" && c.kind() !== ")" && c.kind() !== ",",
    );
    const configObj = argList[0];
    if (!configObj || configObj.kind() !== "object") continue;

    const pairs = configObj.children().filter(
      (c) => c.kind() === "pair" || c.kind() === "method_definition",
    );
    if (pairs.length <= 1) continue;

    const sorted = [...pairs].sort((a, b) => {
      const nameA = getPairKeyName(a);
      const nameB = getPairKeyName(b);
      const idxA = getCorrectIndex(methodsOrder, nameA);
      const idxB = getCorrectIndex(methodsOrder, nameB);
      if (idxA !== idxB) return idxA - idxB;
      return nameA.localeCompare(nameB);
    });

    const first = pairs[0]!;
    const last = pairs[pairs.length - 1]!;
    const start = first.range().start.index;
    const end = last.range().end.index;
    const sep = ",\n\n  ";
    const newContent = sorted.map((p) => p.text()).join(sep);
    edits.push({ startPos: start, endPos: end, insertedText: newContent });
    metric.increment({ file: root.filename() });
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
