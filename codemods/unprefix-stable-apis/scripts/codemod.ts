import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import { parse } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getAllImports, updateImport } from "@jssg/utils/javascript/imports";

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

function isInsideImport(node: SgNode<TSX>): boolean {
  return node.ancestors().some((ancestor) => ancestor.kind() === "import_statement");
}

function isInsideReactRequireDestructure(node: SgNode<TSX>): boolean {
  return node.ancestors().some((ancestor) => {
    if (ancestor.kind() !== "variable_declarator") return false;
    const name = ancestor.field("name");
    if (!name || name.kind() !== "object_pattern") return false;
    const init = ancestor.field("value");
    if (!init || init.kind() !== "call_expression") return false;
    const fn = init.field("function");
    if (!fn || fn.kind() !== "identifier" || fn.text() !== "require") return false;
    const args = init.field("arguments");
    const firstString = args?.find({ rule: { kind: "string" } });
    const fragment = firstString?.find({ rule: { kind: "string_fragment" } });
    return fragment?.text() === REACT_MODULE;
  });
}

/** Local names that refer to the React module object (default import, namespace import, require binding). */
function findReactNamespaceBindings(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();
  for (const binding of getAllImports(rootNode, { type: "default", from: REACT_MODULE })) {
    names.add(binding.alias);
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

type NamedRename = { name: string; to: string; alias?: string };

function collectNamedRenames(rootNode: SgNode<TSX, "program">): {
  specifiers: NamedRename[];
  localRenames: Map<string, string>;
  renames: number;
  handledStarts: Set<number>;
} {
  const specifiers: NamedRename[] = [];
  const localRenames = new Map<string, string>();
  const handledStarts = new Set<number>();
  let renames = 0;
  const seen = new Set<string>();

  for (const [oldName, newName] of Object.entries(RENAMES)) {
    for (const binding of getAllImports(rootNode, {
      type: "named",
      name: oldName,
      from: REACT_MODULE,
    })) {
      // Named queries fall back to namespace imports when no specifier matches.
      if (binding.isNamespace) continue;

      const key = `${binding.node.range().start.index}:${oldName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      handledStarts.add(binding.node.range().start.index);
      const parent = binding.node.parent();
      if (parent) handledStarts.add(parent.range().start.index);

      const hasExplicitAlias = binding.alias !== oldName;
      if (hasExplicitAlias) {
        specifiers.push({ name: oldName, to: newName });
      } else if (isNameTaken(rootNode, newName, binding.node)) {
        specifiers.push({ name: oldName, to: newName, alias: oldName });
      } else {
        specifiers.push({ name: oldName, to: newName });
        localRenames.set(oldName, newName);
      }
      renames += 1;
    }
  }

  return { specifiers, localRenames, renames, handledStarts };
}

function applyNamedImportRenames(source: string, specifiers: NamedRename[]): string {
  if (specifiers.length === 0) return source;

  let current = source;
  let program = parse<TSX>("tsx", current).root();

  // updateImport rewrites one clause per call; loop until every clause is updated.
  while (true) {
    const edit = updateImport(program, {
      type: "named",
      from: REACT_MODULE,
      specifiers,
    });
    if (!edit) break;
    current = program.commitEdits([edit]);
    program = parse<TSX>("tsx", current).root();
  }

  return current;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("unprefix-stable-apis-renames");

  const {
    specifiers,
    localRenames,
    renames: importRenames,
    handledStarts,
  } = collectNamedRenames(rootNode);
  let renames = importRenames;

  // Member access through the module object: React.unstable_ViewTransition, <React.unstable_Activity>.
  const namespaceBindings = findReactNamespaceBindings(rootNode);
  if (namespaceBindings.size > 0) {
    for (const member of rootNode.findAll({ rule: { kind: "member_expression" } })) {
      const object = member.field("object");
      const property = member.field("property");
      if (!object || !property || object.kind() !== "identifier" || !namespaceBindings.has(object.text())) {
        continue;
      }
      const newName = stableName(property.text());
      if (!newName) continue;
      edits.push(property.replace(newName));
      renames++;
    }
  }

  // Usage sites of bindings whose local name changed.
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
      if (isInsideReactRequireDestructure(usage)) continue;
      if (usage.ancestors().some((ancestor) => handledStarts.has(ancestor.range().start.index))) {
        continue;
      }
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

  if (edits.length === 0 && specifiers.length === 0) return null;

  let source = edits.length > 0 ? rootNode.commitEdits(edits) : rootNode.text();
  source = applyNamedImportRenames(source, specifiers);

  if (source === rootNode.text()) return null;

  metric.increment({ file: metricFile(root.filename()) }, renames);
  return source;
};

export default transform;
