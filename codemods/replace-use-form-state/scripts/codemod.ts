import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}


const REACT_DOM_MODULE = "react-dom";

type NamedUseFormStateImport = { importNode: SgNode<TSX>; specifier: SgNode<TSX>; localName: string };

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

function findReactDOMMemberImportNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(imp) !== REACT_DOM_MODULE) continue;

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

function findNamedUseFormStateImports(rootNode: SgNode<TSX, "program">): NamedUseFormStateImport[] {
  const imports: NamedUseFormStateImport[] = [];

  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== REACT_DOM_MODULE) continue;

    for (const specifier of importNode.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.field("name")?.text() !== "useFormState") continue;
      imports.push({
        importNode,
        specifier,
        localName: specifier.field("alias")?.text() ?? specifier.field("name")?.text() ?? "useFormState",
      });
    }
  }

  return imports;
}

function replacementImportSpecifierText(usedName: string): string {
  return usedName === "useFormState"
    ? "useActionState"
    : `useActionState as ${usedName}`;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("replace-use-form-state-migrations");

  const reactDOMMemberImportNames = findReactDOMMemberImportNames(rootNode);
  const namedUseFormStateImports = findNamedUseFormStateImports(rootNode);

  if (reactDOMMemberImportNames.size > 0) {
    const memberCalls = rootNode.findAll({
      rule: {
        kind: "member_expression",
        has: {
          kind: "property_identifier",
          regex: "^useFormState$",
        },
      },
    });

    for (const member of memberCalls) {
      const objNode = member.field("object");
      if (objNode && reactDOMMemberImportNames.has(objNode.text())) {
        const propNode = member.field("property");
        if (propNode) {
          edits.push(propNode.replace("useActionState"));
          metric.increment({ file: metricFile(root.filename()), pattern: "member-call" });
        }
      }
    }
  }

  if (namedUseFormStateImports.length > 0) {
    let shouldRenameUnaliasedUses = false;

    for (const entry of namedUseFormStateImports) {
      edits.push(entry.specifier.replace(replacementImportSpecifierText(entry.localName)));
      if (entry.localName === "useFormState") {
        shouldRenameUnaliasedUses = true;
      }
    }

    if (shouldRenameUnaliasedUses) {
      const renameTargets = rootNode.findAll({
        rule: {
          any: [
            { kind: "identifier", regex: "^useFormState$" },
            { kind: "type_identifier", regex: "^useFormState$" },
          ],
        },
      });

      for (const node of renameTargets) {
        if (node.ancestors().some((ancestor) => ancestor.kind() === "import_statement")) continue;
        edits.push(node.replace("useActionState"));
      }
    }

    metric.increment({ file: metricFile(root.filename()), pattern: "named-import" });
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
