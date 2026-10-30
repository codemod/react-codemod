import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { addImport, getImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

const REACT_MODULE = "react";
const WRAPPER_TAGS = new Set(["div", "span"]);

/** Methods available on a FragmentInstance (the value of a Fragment ref). */
const FRAGMENT_INSTANCE_METHODS = new Set([
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "focus",
  "focusLast",
  "blur",
  "observeUsing",
  "unobserveUsing",
  "getClientRects",
  "getRootNode",
  "compareDocumentPosition",
  "scrollIntoView",
]);

type Wrapper = {
  element: SgNode<TSX>;
  opening: SgNode<TSX>;
  closing: SgNode<TSX>;
  refAttr: SgNode<TSX>;
  refName: string;
};

function namedChildren(node: SgNode<TSX> | null): SgNode<TSX>[] {
  if (!node) return [];
  return node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function attributeName(attr: SgNode<TSX>): string | null {
  const name = attr.children().find((child) => child.kind() === "property_identifier");
  return name ? name.text() : null;
}

function attributeExpression(attr: SgNode<TSX>): SgNode<TSX> | null {
  const expression = attr.children().find((child) => child.kind() === "jsx_expression");
  return expression ? namedChildren(expression)[0] ?? null : null;
}

function isDisplayContentsStyle(node: SgNode<TSX> | null): boolean {
  if (!node || node.kind() !== "object") return false;
  const compact = node.text().replace(/\s+/g, "");
  return /^\{(?:display|"display"|'display'):(?:"contents"|'contents'),?\}$/.test(compact);
}

function findWrapper(element: SgNode<TSX>): Wrapper | null {
  const opening = element.children().find((child) => child.kind() === "jsx_opening_element");
  const closing = element.children().find((child) => child.kind() === "jsx_closing_element");
  if (!opening || !closing) return null;

  const tagName = opening.field("name");
  if (!tagName || tagName.kind() !== "identifier" || !WRAPPER_TAGS.has(tagName.text())) return null;

  const attributeNodes = opening.children().filter((child) => child.kind() === "jsx_attribute" || child.kind() === "jsx_spread_attribute");
  if (attributeNodes.length !== 2 || attributeNodes.some((attr) => attr.kind() === "jsx_spread_attribute")) return null;

  let refAttr: SgNode<TSX> | null = null;
  let refName: string | null = null;
  let hasContentsStyle = false;
  for (const attr of attributeNodes) {
    const name = attributeName(attr);
    const expression = attributeExpression(attr);
    if (name === "ref" && expression && expression.kind() === "identifier") {
      refAttr = attr;
      refName = expression.text();
    } else if (name === "style" && isDisplayContentsStyle(expression)) {
      hasContentsStyle = true;
    }
  }
  if (!refAttr || !refName || !hasContentsStyle) return null;

  return { element, opening, closing, refAttr, refName };
}

/** Every reference to the ref must be its declaration, this wrapper's ref prop, or `ref.current.<FragmentInstance method>`. */
function refUsagesAreFragmentSafe(rootNode: SgNode<TSX, "program">, wrapper: Wrapper): boolean {
  const usages = rootNode.findAll({ rule: { kind: "identifier", regex: `^${wrapper.refName}$` } });

  for (const usage of usages) {
    const parent = usage.parent();
    if (!parent) return false;

    if (parent.kind() === "variable_declarator" && parent.field("name")?.id() === usage.id()) continue;

    if (parent.kind() === "jsx_expression") {
      const attr = parent.parent();
      if (attr && attr.id() === wrapper.refAttr.id()) continue;
      return false;
    }

    if (parent.kind() === "member_expression" && parent.field("object")?.id() === usage.id()) {
      if (parent.field("property")?.text() !== "current") return false;
      const access = parent.parent();
      if (!access || access.kind() !== "member_expression" || access.field("object")?.id() !== parent.id()) return false;
      const method = access.field("property")?.text() ?? "";
      if (!FRAGMENT_INSTANCE_METHODS.has(method)) return false;
      continue;
    }

    return false;
  }

  return true;
}

function isLeadingDirective(node: SgNode<TSX> | undefined): boolean {
  if (!node || node.kind() !== "expression_statement") return false;
  return namedChildren(node)[0]?.kind() === "string";
}

function fragmentImportEdit(rootNode: SgNode<TSX, "program">): Edit | null {
  const edit = addImport(rootNode, {
    type: "named",
    specifiers: [{ name: "Fragment" }],
    from: REACT_MODULE,
  });
  if (!edit) return null;

  // addImport inserts at file start when there are no imports; keep "use client" first.
  if (edit.startPos === 0) {
    const first = namedChildren(rootNode)[0];
    if (isLeadingDirective(first)) {
      const insertPos = first!.range().end.index;
      return {
        startPos: insertPos,
        endPos: insertPos,
        insertedText: `\n\n${edit.insertedText.replace(/^\n+/, "").replace(/\n$/, "")}`,
      };
    }
  }

  return edit;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("fragment-ref-wrapper-replacements");

  const wrappers: Wrapper[] = [];
  for (const element of rootNode.findAll({ rule: { kind: "jsx_element" } })) {
    const wrapper = findWrapper(element);
    if (wrapper && refUsagesAreFragmentSafe(rootNode, wrapper)) wrappers.push(wrapper);
  }
  if (wrappers.length === 0) return null;

  const fragmentImport = getImport(rootNode, {
    type: "named",
    name: "Fragment",
    from: REACT_MODULE,
  });
  const reactBinding = getImport(rootNode, { type: "default", from: REACT_MODULE });

  let fragmentName: string;
  if (fragmentImport) {
    fragmentName = fragmentImport.alias;
  } else if (reactBinding) {
    fragmentName = `${reactBinding.alias}.Fragment`;
  } else {
    if (
      rootNode.find({
        rule: {
          any: [
            { kind: "identifier", regex: "^Fragment$" },
            { kind: "type_identifier", regex: "^Fragment$" },
          ],
        },
      })
    ) {
      return null;
    }
    fragmentName = "Fragment";
    const importEdit = fragmentImportEdit(rootNode);
    if (importEdit) edits.push(importEdit);
  }

  for (const wrapper of wrappers) {
    edits.push(wrapper.opening.replace(`<${fragmentName} ${wrapper.refAttr.text()}>`));
    edits.push(wrapper.closing.replace(`</${fragmentName}>`));
  }

  metric.increment({ file: metricFile(root.filename()) }, wrappers.length);
  return rootNode.commitEdits(edits);
};

export default transform;
