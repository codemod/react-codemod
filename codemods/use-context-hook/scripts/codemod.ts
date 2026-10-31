import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import { parse } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getAllImports, updateImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findReactMemberImportNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();
  for (const binding of getAllImports(rootNode, { type: "default", from: "react" })) {
    names.add(binding.alias);
  }
  return names;
}

function applyUseContextImportRenames(source: string): string {
  let current = source;
  let program = parse<TSX>("tsx", current).root();

  while (true) {
    const edit = updateImport(program, {
      type: "named",
      from: "react",
      specifiers: [{ name: "useContext", to: "use" }],
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

  const transformMetric = useMetricAtom("use-context-transformations");

  const reactMemberImportNames = findReactMemberImportNames(rootNode);
  const namedUseContextImports = getAllImports(rootNode, {
    type: "named",
    name: "useContext",
    from: "react",
  });

  const shouldSkipLegacyIdentifierRename = (node: SgNode<TSX>): boolean => {
    const parent = node.parent();
    if (!parent) return false;
    if (node.ancestors().some((ancestor) => ancestor.kind() === "import_statement")) return true;
    if (
      parent.kind() === "member_expression" &&
      parent.field("property")?.id() === node.id()
    ) {
      return true;
    }
    return false;
  };

  const reactMemberCalls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "member_expression",
        all: [
          {
            has: {
              field: "object",
              kind: "identifier",
              regex: ".*",
            },
          },
          {
            has: {
              field: "property",
              kind: "property_identifier",
              regex: "^useContext$",
            },
          },
        ],
      },
    },
  });

  let reactMemberCallCount = 0;
  for (const call of reactMemberCalls) {
    const functionNode = call.field("function");
    const objectNode = functionNode?.field("object");
    if (!objectNode || !reactMemberImportNames.has(objectNode.text())) continue;

    const propertyNode = functionNode?.field("property");
    if (!propertyNode) continue;

    edits.push(propertyNode.replace("use"));
    reactMemberCallCount += 1;
  }

  if (reactMemberCallCount > 0) {
    transformMetric.increment({
      pattern: "React.useContext",
      file: metricFile(root.filename()),
    }, reactMemberCallCount);
  }

  const activeLocalNames = new Map<string, number>();
  for (const localName of new Set(namedUseContextImports.map((entry) => entry.alias))) {
    const useContextCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: `^${escapeRegex(localName)}$`,
        },
      },
    });

    if (useContextCalls.length > 0) {
      activeLocalNames.set(localName, useContextCalls.length);
    }
  }

  const needsImportRename = activeLocalNames.size > 0;
  const hasUnaliasedImport = namedUseContextImports.some((entry) => entry.alias === "useContext");

  // updateImport renames every useContext specifier, so the unaliased binding's
  // references must follow whenever any alias triggers the import rename.
  if (needsImportRename && hasUnaliasedImport) {
    const renameTargets = rootNode.findAll({
      rule: {
        any: [
          { kind: "identifier", regex: "^useContext$" },
          { kind: "type_identifier", regex: "^useContext$" },
        ],
      },
    });

    for (const node of renameTargets) {
      if (shouldSkipLegacyIdentifierRename(node)) continue;
      edits.push(node.replace("use"));
    }
  }

  const unaliasedCallCount = activeLocalNames.get("useContext") ?? 0;
  if (unaliasedCallCount > 0) {
    transformMetric.increment({
      pattern: "useContext",
      file: metricFile(root.filename()),
    }, unaliasedCallCount);
  }

  let aliasedCallCount = 0;
  for (const [localName, count] of activeLocalNames) {
    if (localName === "useContext") continue;
    aliasedCallCount += count;
  }

  if (aliasedCallCount > 0) {
    transformMetric.increment({
      pattern: "useContext (aliased)",
      file: metricFile(root.filename()),
    }, aliasedCallCount);
  }

  if (edits.length === 0 && !needsImportRename) {
    return null;
  }

  let source = edits.length > 0 ? rootNode.commitEdits(edits) : rootNode.text();
  if (needsImportRename) {
    source = applyUseContextImportRenames(source);
  }

  return source === rootNode.text() ? null : source;
};

export default transform;
