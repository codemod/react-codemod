import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const REACT_MODULES = new Set(["React", "react", "react/addons", "react-native"]);

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

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

function hasReact(rootNode: SgNode<TSX, "program">): boolean {
  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (REACT_MODULES.has(importSource(importNode) ?? "")) return true;
  }

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (REACT_MODULES.has(requireSource(call) ?? "")) return true;
  }

  return false;
}

function explicitRequireDisabled(value: unknown): boolean {
  return value === false || value === "false";
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

function reactCreateClassDeclarators(rootNode: SgNode<TSX, "program">): Array<{
  declarator: SgNode<TSX>;
  call: SgNode<TSX>;
}> {
  const result: Array<{ declarator: SgNode<TSX>; call: SgNode<TSX> }> = [];
  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const value = declarator.field("value");
    if (isReactCreateClassCall(value)) result.push({ declarator, call: value });
  }
  return result;
}


const DEFAULT_MIXIN_NAME = "PureRenderMixin";
const SHOULD_COMPONENT_UPDATE = "shouldComponentUpdate";
const RENDER = "render";

function getConfigObject(call: SgNode<TSX>): SgNode<TSX> | null {
  const args = call.field("arguments");
  if (!args) return null;
  return args.find({ rule: { kind: "object" } });
}

function pairWithKeyRule(keyName: string) {
  const escaped = keyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    kind: "pair" as const,
    has: {
      field: "key",
      any: [
        { kind: "property_identifier" as const, regex: `^${escaped}$` },
        { kind: "identifier" as const, regex: `^${escaped}$` },
      ],
    },
  };
}

const PAIR_RULE = { rule: { kind: "pair" as const } };

function arrayIdentifierNamedRule(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { rule: { kind: "identifier" as const, regex: `^${escaped}$` } };
}

function getPairKeyName(node: SgNode<TSX>): string {
  return node.field("key")?.text() ?? node.field("name")?.text() ?? "";
}

function declarationRemovalRange(varDecl: SgNode<TSX>, source: string): { start: number; end: number } {
  let start = varDecl.range().start.index;
  let end = varDecl.range().end.index;
  const before = source.slice(0, start);
  const after = source.slice(end);
  if (after.startsWith("\n\n")) {
    end += 1;
  }
  if (before.endsWith("\n\n") && after.startsWith("\n\n")) {
    start -= 1;
  }
  return { start, end };
}

function shouldUpdatePropertyText(): string {
  return `${SHOULD_COMPONENT_UPDATE}: function(nextProps, nextState) {\n    return React.addons.shallowCompare(this, nextProps, nextState);\n  }`;
}

function renderConfigObject(configObj: SgNode<TSX>, mixinsPair: SgNode<TSX>, mixinName: string): string | null {
  const mixinsValue = mixinsPair.field("value");
  if (!mixinsValue || mixinsValue.kind() !== "array") return null;
  const mixinInArray = mixinsValue.findAll(arrayIdentifierNamedRule(mixinName));
  if (mixinInArray.length === 0) return null;

  const toRemoveSet = new Set(mixinInArray.map((n) => n.range().start.index));
  const kept = mixinsValue.children().filter(
    (c) =>
      c.kind() !== "[" &&
      c.kind() !== "]" &&
      c.kind() !== "," &&
      !toRemoveSet.has(c.range().start.index),
  );

  const pairs = configObj.findAll(PAIR_RULE)
    .sort((a, b) => a.range().start.index - b.range().start.index);
  const renderedProps: string[] = [];
  let renderIndex = -1;

  for (const pair of pairs) {
    if (pair.id() === mixinsPair.id()) {
      if (kept.length > 0) {
        renderedProps.push(`mixins: [${kept.map((e) => e.text()).join(", ")}]`);
      }
      continue;
    }

    if (getPairKeyName(pair) === RENDER) {
      renderIndex = renderedProps.length;
    }
    renderedProps.push(pair.text());
  }

  if (renderedProps.length === 0) return null;

  const shouldUpdateText = shouldUpdatePropertyText();
  if (renderIndex >= 0 && renderIndex === renderedProps.length - 1) {
    renderedProps.splice(renderIndex, 0, shouldUpdateText);
  } else {
    renderedProps.push(shouldUpdateText);
  }

  return `{\n  ${renderedProps.join(",\n\n  ")},\n}`;
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  if (!explicitRequireDisabled(options.params?.["explicit-require"]) && !hasReact(rootNode)) {
    return null;
  }

  const source = rootNode.text();
  const edits: Edit[] = [];

  const mixinName = (options.params?.["mixin-name"] as string) ?? DEFAULT_MIXIN_NAME;
  const metric = useMetricAtom("pure-render-mixin-replacements");
  let transformCount = 0;

  for (const { call } of reactCreateClassDeclarators(rootNode)) {
    const configObj = getConfigObject(call);
    if (!configObj) continue;

    const mixinsPair = configObj.find({ rule: pairWithKeyRule("mixins") });
    const hasShouldUpdate = configObj.find({ rule: pairWithKeyRule(SHOULD_COMPONENT_UPDATE) }) !== null;
    const renderPair = configObj.find({ rule: pairWithKeyRule(RENDER) });

    if (!mixinsPair || hasShouldUpdate || !renderPair) continue;

    const value = mixinsPair.field("value");
    if (!value || value.kind() !== "array") continue;
    const mixinInArray = value.findAll(arrayIdentifierNamedRule(mixinName));
    if (mixinInArray.length === 0) continue;

    const newConfigText = renderConfigObject(configObj, mixinsPair, mixinName);
    if (!newConfigText) continue;
    edits.push(configObj.replace(newConfigText));

    transformCount++;
    metric.increment({ file: metricFile(root.filename()) });
  }

  if (edits.length > 0 && transformCount > 0) {
    const escapedMixin = mixinName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mixinVarDeclarators = rootNode.findAll({
      rule: {
        kind: "variable_declarator",
        has: { field: "name", kind: "identifier" as const, regex: `^${escapedMixin}$` },
      },
    });
    const mixinIdentifiers = rootNode.findAll({
      rule: { kind: "identifier" as const, regex: `^${escapedMixin}$` },
    });
    if (mixinIdentifiers.length <= 2) {
      for (const decl of mixinVarDeclarators) {
        const varDecl = decl.parent();
        if (!varDecl || varDecl.kind() !== "variable_declaration") continue;
        const decls = varDecl.findAll({ rule: { kind: "variable_declarator" } });
        if (decls.length !== 1) continue;
        const after = source.slice(varDecl.range().end.index, varDecl.range().end.index + 10);
        const range = declarationRemovalRange(varDecl, source);
        edits.push({
          startPos: range.start,
          endPos: range.end,
          insertedText: "",
        });
        break;
      }
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
