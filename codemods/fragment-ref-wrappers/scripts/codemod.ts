import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

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

type ReactImports = {
  namespaces: Set<string>;
  fragmentLocalName: string | null;
  firstNamedImport: SgNode<TSX> | null;
  lastImport: SgNode<TSX> | null;
};

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

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function isTypeOnlyImport(node: SgNode<TSX>): boolean {
  return node.children().some((child) => !child.isNamed() && child.text() === "type");
}

function collectReactImports(rootNode: SgNode<TSX, "program">): ReactImports {
  const result: ReactImports = { namespaces: new Set(), fragmentLocalName: null, firstNamedImport: null, lastImport: null };

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (imp.parent()?.kind() !== "program") continue;
    result.lastImport = imp;
    if (importSource(imp) !== REACT_MODULE || isTypeOnlyImport(imp)) continue;

    const importClause = imp.find({ rule: { kind: "import_clause" } });
    const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");
    if (defaultIdentifier) result.namespaces.add(defaultIdentifier.text());
    const namespaceImport = imp.find({ rule: { kind: "namespace_import" } });
    const namespaceName = namespaceImport?.field("name") ?? namespaceImport?.find({ rule: { kind: "identifier" } });
    if (namespaceName) result.namespaces.add(namespaceName.text());

    if (imp.find({ rule: { kind: "named_imports" } }) && !result.firstNamedImport) result.firstNamedImport = imp;
    for (const specifier of imp.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.field("name")?.text() === "Fragment") {
        result.fragmentLocalName = specifier.field("alias")?.text() ?? "Fragment";
      }
    }
  }

  return result;
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

function fragmentImportEdit(rootNode: SgNode<TSX, "program">, imports: ReactImports): Edit | null {
  if (imports.firstNamedImport) {
    const namedImports = imports.firstNamedImport.find({ rule: { kind: "named_imports" } });
    if (namedImports) {
      const text = namedImports.text();
      let insertPos = namedImports.range().end.index - 1;
      let offset = text.length - 1;
      while (offset > 0 && /\s/.test(text[offset - 1] ?? "")) {
        offset--;
        insertPos--;
      }
      const inner = text.slice(1, -1).trim();
      return { startPos: insertPos, endPos: insertPos, insertedText: inner.length > 0 ? ", Fragment" : " Fragment " };
    }
  }

  const statement = 'import { Fragment } from "react";';
  if (imports.lastImport) {
    const insertPos = imports.lastImport.range().end.index;
    return { startPos: insertPos, endPos: insertPos, insertedText: `\n${statement}` };
  }

  // Keep a leading directive such as "use client" first.
  const first = namedChildren(rootNode)[0];
  if (first && first.kind() === "expression_statement" && namedChildren(first)[0]?.kind() === "string") {
    const insertPos = first.range().end.index;
    return { startPos: insertPos, endPos: insertPos, insertedText: `\n\n${statement}` };
  }

  return { startPos: 0, endPos: 0, insertedText: `${statement}\n\n` };
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

  const imports = collectReactImports(rootNode);
  let fragmentName: string;
  if (imports.fragmentLocalName) {
    fragmentName = imports.fragmentLocalName;
  } else {
    const namespace = [...imports.namespaces][0];
    if (namespace) {
      fragmentName = `${namespace}.Fragment`;
    } else {
      if (rootNode.find({ rule: { any: [{ kind: "identifier", regex: "^Fragment$" }, { kind: "type_identifier", regex: "^Fragment$" }] } })) {
        return null;
      }
      fragmentName = "Fragment";
      const importEdit = fragmentImportEdit(rootNode, imports);
      if (importEdit) edits.push(importEdit);
    }
  }

  for (const wrapper of wrappers) {
    edits.push(wrapper.opening.replace(`<${fragmentName} ${wrapper.refAttr.text()}>`));
    edits.push(wrapper.closing.replace(`</${fragmentName}>`));
  }

  metric.increment({ file: metricFile(root.filename()) }, wrappers.length);
  return rootNode.commitEdits(edits);
};

export default transform;
