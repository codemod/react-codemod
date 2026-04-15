import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

type NamedUseContextImport = { specifier: SgNode<TSX>; localName: string };

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

function findReactMemberImportNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(imp) !== "react") continue;

    const importClause = imp.find({ rule: { kind: "import_clause" } });
    const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");
    if (defaultIdentifier) names.add(defaultIdentifier.text());

    const namespaceImport = imp.find({ rule: { kind: "namespace_import" } });
    const namespaceName =
      namespaceImport?.field("name") ?? namespaceImport?.find({ rule: { kind: "identifier" } });
    if (namespaceName) names.add(namespaceName.text());
  }

  return names;
}

function findNamedUseContextImports(rootNode: SgNode<TSX, "program">): NamedUseContextImport[] {
  const imports: NamedUseContextImport[] = [];

  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== "react") continue;

    for (const specifier of importNode.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.field("name")?.text() !== "useContext") continue;
      imports.push({
        specifier,
        localName: specifier.field("alias")?.text() ?? "useContext",
      });
    }
  }

  return imports;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const transformMetric = useMetricAtom("use-context-transformations");

  const reactMemberImportNames = findReactMemberImportNames(rootNode);
  const namedUseContextImports = findNamedUseContextImports(rootNode);

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
  for (const localName of new Set(namedUseContextImports.map((entry) => entry.localName))) {
    const useContextCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: `^${localName}$`,
        },
      },
    });

    if (useContextCalls.length > 0) {
      activeLocalNames.set(localName, useContextCalls.length);
    }
  }

  if (activeLocalNames.has("useContext")) {
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

  for (const entry of namedUseContextImports) {
    if (!activeLocalNames.has(entry.localName)) continue;
    const replacementText = entry.localName === "useContext" ? "use" : `use as ${entry.localName}`;
    edits.push(entry.specifier.replace(replacementText));
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

  if (edits.length === 0) {
    return null;
  }

  return rootNode.commitEdits(edits);
};

export default transform;
