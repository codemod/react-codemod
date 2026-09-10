import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

const REACT_MODULE = "react";

/**
 * Experimental export name -> stable export name.
 * ViewTransition and addTransitionType stabilized in React 19.3,
 * Activity and useEffectEvent stabilized in React 19.2.
 */
const RENAMES: Record<string, string> = {
  unstable_ViewTransition: "ViewTransition",
  unstable_addTransitionType: "addTransitionType",
  unstable_Activity: "Activity",
  experimental_useEffectEvent: "useEffectEvent",
};

function stableName(name: string | undefined): string | null {
  if (!name) return null;
  return Object.prototype.hasOwnProperty.call(RENAMES, name) ? RENAMES[name] ?? null : null;
}

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

function isReactRequireCall(node: SgNode<TSX> | null): boolean {
  if (!node || node.kind() !== "call_expression") return false;
  const fn = node.field("function");
  if (!fn || fn.kind() !== "identifier" || fn.text() !== "require") return false;
  const args = namedChildren(node.field("arguments"));
  const first = args[0];
  return args.length === 1 && !!first && first.kind() === "string" && sourceText(first) === REACT_MODULE;
}

function isInsideImport(node: SgNode<TSX>): boolean {
  return node.ancestors().some((ancestor) => ancestor.kind() === "import_statement");
}

/** Local names that refer to the React module object (default import, namespace import, require binding). */
function findReactNamespaceBindings(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(imp) !== REACT_MODULE) continue;
    const importClause = imp.find({ rule: { kind: "import_clause" } });
    const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");
    if (defaultIdentifier) names.add(defaultIdentifier.text());
    const namespaceImport = imp.find({ rule: { kind: "namespace_import" } });
    const namespaceName = namespaceImport?.field("name") ?? namespaceImport?.find({ rule: { kind: "identifier" } });
    if (namespaceName) names.add(namespaceName.text());
  }

  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    if (name && name.kind() === "identifier" && isReactRequireCall(declarator.field("value"))) {
      names.add(name.text());
    }
  }

  return names;
}

/** True when `name` is already bound somewhere in the file, outside of `ignore`. */
function isNameTaken(rootNode: SgNode<TSX, "program">, name: string, ignore: SgNode<TSX>): boolean {
  const ignoreStart = ignore.range().start.index;
  const ignoreEnd = ignore.range().end.index;
  const matches = rootNode.findAll({
    rule: {
      any: [
        { kind: "identifier", regex: `^${name}$` },
        { kind: "shorthand_property_identifier_pattern", regex: `^${name}$` },
        { kind: "type_identifier", regex: `^${name}$` },
      ],
    },
  });
  return matches.some((match) => {
    const start = match.range().start.index;
    return start < ignoreStart || start >= ignoreEnd;
  });
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("unprefix-stable-apis-renames");
  let renames = 0;

  // Old local name -> new local name, for bindings whose local identifier changes.
  const localRenames = new Map<string, string>();
  // Ranges of nodes we already rewrote, so the usage-site pass skips them.
  const handledStarts = new Set<number>();

  // 1. ESM named imports from "react".
  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== REACT_MODULE) continue;

    for (const specifier of importNode.findAll({ rule: { kind: "import_specifier" } })) {
      const nameNode = specifier.field("name");
      const newName = stableName(nameNode?.text());
      if (!nameNode || !newName) continue;
      const oldName = nameNode.text();
      const alias = specifier.field("alias");

      if (alias) {
        edits.push(specifier.replace(alias.text() === newName ? newName : `${newName} as ${alias.text()}`));
      } else if (isNameTaken(rootNode, newName, specifier)) {
        edits.push(specifier.replace(`${newName} as ${oldName}`));
      } else {
        edits.push(specifier.replace(newName));
        localRenames.set(oldName, newName);
      }
      handledStarts.add(specifier.range().start.index);
      renames++;
    }
  }

  // 2. CommonJS destructuring: const { unstable_ViewTransition } = require("react").
  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const pattern = declarator.field("name");
    if (!pattern || pattern.kind() !== "object_pattern" || !isReactRequireCall(declarator.field("value"))) continue;

    for (const entry of namedChildren(pattern)) {
      if (entry.kind() === "pair_pattern") {
        const key = entry.field("key");
        const newName = stableName(key?.text());
        if (!key || !newName) continue;
        const value = entry.field("value");
        if (value && value.kind() === "identifier" && value.text() === newName) {
          // { unstable_ViewTransition: ViewTransition } -> { ViewTransition }
          edits.push(entry.replace(newName));
        } else {
          edits.push(key.replace(newName));
        }
        handledStarts.add(entry.range().start.index);
        renames++;
      } else if (entry.kind() === "shorthand_property_identifier_pattern") {
        const oldName = entry.text();
        const newName = stableName(oldName);
        if (!newName) continue;
        if (isNameTaken(rootNode, newName, entry)) {
          edits.push(entry.replace(`${newName}: ${oldName}`));
        } else {
          edits.push(entry.replace(newName));
          localRenames.set(oldName, newName);
        }
        handledStarts.add(entry.range().start.index);
        renames++;
      }
    }
  }

  // 3. Member access through the module object: React.unstable_ViewTransition, <React.unstable_Activity>.
  const namespaceBindings = findReactNamespaceBindings(rootNode);
  if (namespaceBindings.size > 0) {
    for (const member of rootNode.findAll({ rule: { kind: "member_expression" } })) {
      const object = member.field("object");
      const property = member.field("property");
      if (!object || !property || object.kind() !== "identifier" || !namespaceBindings.has(object.text())) continue;
      const newName = stableName(property.text());
      if (!newName) continue;
      edits.push(property.replace(newName));
      renames++;
    }
  }

  // 4. Usage sites of bindings whose local name changed.
  for (const [oldName, newName] of localRenames) {
    const usages = rootNode.findAll({
      rule: {
        any: [
          { kind: "identifier", regex: `^${oldName}$` },
          { kind: "type_identifier", regex: `^${oldName}$` },
          { kind: "shorthand_property_identifier", regex: `^${oldName}$` },
        ],
      },
    });

    for (const usage of usages) {
      if (isInsideImport(usage)) continue;
      if (usage.ancestors().some((ancestor) => handledStarts.has(ancestor.range().start.index))) continue;
      if (handledStarts.has(usage.range().start.index)) continue;

      const parent = usage.parent();
      if (usage.kind() === "shorthand_property_identifier") {
        // { unstable_ViewTransition } -> { unstable_ViewTransition: ViewTransition } keeps the object key stable.
        edits.push(usage.replace(`${oldName}: ${newName}`));
        continue;
      }

      if (parent && parent.kind() === "export_specifier") {
        const exportAlias = parent.field("alias");
        if (!exportAlias) {
          // export { unstable_ViewTransition } -> export { ViewTransition as unstable_ViewTransition }
          edits.push(usage.replace(`${newName} as ${oldName}`));
          continue;
        }
        if (exportAlias.range().start.index === usage.range().start.index) continue;
      }

      edits.push(usage.replace(newName));
    }
  }

  if (edits.length === 0) return null;

  metric.increment({ file: metricFile(root.filename()) }, renames);
  return rootNode.commitEdits(edits);
};

export default transform;
