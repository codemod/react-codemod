import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

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

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];

  const mixinName = (options.params?.["mixin-name"] as string) ?? DEFAULT_MIXIN_NAME;
  const metric = useMetricAtom("pure-render-mixin-replacements");
  let transformCount = 0;

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

    const toRemoveSet = new Set(mixinInArray.map((n) => n.range().start.index));
    const kept = value.children().filter(
      (c) =>
        c.kind() !== "[" &&
        c.kind() !== "]" &&
        c.kind() !== "," &&
        !toRemoveSet.has(c.range().start.index),
    );
    const newArrayText = kept.length === 0 ? "[]" : "[" + kept.map((e) => e.text()).join(", ") + "]";

    const allPairs = configObj.findAll(PAIR_RULE);
    allPairs.sort((a, b) => a.range().start.index - b.range().start.index);
    const mixinsIdx = allPairs.findIndex((p) => p.range().start.index === mixinsPair.range().start.index);
    const nextPair = mixinsIdx >= 0 && mixinsIdx < allPairs.length - 1 ? allPairs[mixinsIdx + 1]! : null;
    const prevPair = mixinsIdx > 0 ? allPairs[mixinsIdx - 1]! : null;

    if (newArrayText === "[]") {
      const removeStart = nextPair
        ? mixinsPair.range().start.index
        : prevPair
          ? prevPair.range().end.index
          : mixinsPair.range().start.index;
      const removeEnd = nextPair
        ? nextPair.range().start.index
        : mixinsPair.range().end.index;
      edits.push({
        startPos: removeStart,
        endPos: removeEnd,
        insertedText: "",
      });
    } else {
      const newMixinsText = `mixins: ${newArrayText}`;
      edits.push(mixinsPair.replace(newMixinsText));
    }

    const renderStart = renderPair.range().start.index;
    const beforeRender = source.slice(Math.max(0, renderStart - 30), renderStart);
    const indentMatch = beforeRender.match(/\n(\s*)$/);
    const indent = indentMatch ? indentMatch[1] : "  ";
    const shouldUpdateBlock = `${indent}${SHOULD_COMPONENT_UPDATE}: function(nextProps, nextState) {\n${indent}  return React.addons.shallowCompare(this, nextProps, nextState);\n${indent}},\n${indent}`;
    edits.push({
      startPos: renderStart,
      endPos: renderStart,
      insertedText: shouldUpdateBlock,
    });

    transformCount++;
    metric.increment({ file: root.filename() });
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
        const trailing = after.match(/^(\s*\n?)/)?.[1] ?? "\n";
        edits.push({
          startPos: varDecl.range().start.index,
          endPos: varDecl.range().end.index + trailing.length,
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
