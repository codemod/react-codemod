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

const REACT_MODULE = "react";

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("replace-use-form-state-migrations");

  const reactDOMMemberImportNames = findReactDOMMemberImportNames(rootNode);
  const namedUseFormStateImports = findNamedUseFormStateImports(rootNode);

  let needsReactImport = false;

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
        // Replace the entire member expression (ReactDOM.useFormState) with just useActionState
        edits.push(member.replace("useActionState"));
        needsReactImport = true;
        metric.increment({ file: metricFile(root.filename()), pattern: "member-call" });
      }
    }
  }

  if (namedUseFormStateImports.length > 0) {
    // Track import statements we've already edited to avoid duplicate edits
    const handledImportRanges = new Set<string>();

    for (const entry of namedUseFormStateImports) {
      const rangeKey = `${entry.importNode.range().start.index}-${entry.importNode.range().end.index}`;
      if (!handledImportRanges.has(rangeKey)) {
        handledImportRanges.add(rangeKey);

        // Count other specifiers in this import (non-useFormState)
        const allSpecifiers = entry.importNode.findAll({ rule: { kind: "import_specifier" } });
        const otherSpecifiers = allSpecifiers.filter(
          (s) => s.field("name")?.text() !== "useFormState"
        );
        const importClause = entry.importNode.find({ rule: { kind: "import_clause" } });
        const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");

        // Detect the quote style from the original import source
        const sourceNode = entry.importNode.field("source") ?? entry.importNode.find({ rule: { kind: "string" } });
        const quoteChar = sourceNode?.text().startsWith("'") ? "'" : '"';

        const reactImportSpecifier = entry.localName !== "useFormState"
          ? `useActionState as ${entry.localName}`
          : "useActionState";

        if (otherSpecifiers.length === 0 && !defaultIdentifier) {
          // useFormState is the only specifier — replace entire import with react import
          edits.push(entry.importNode.replace(
            `import { ${reactImportSpecifier} } from ${quoteChar}react${quoteChar};`
          ));
        } else if (defaultIdentifier && otherSpecifiers.length === 0) {
          // Has default import + useFormState only — remove named imports part, add react import
          // e.g., import ReactDOM, { useFormState } from 'react-dom'
          // → import ReactDOM from 'react-dom';
          //   import { useActionState } from 'react';
          const defaultName = defaultIdentifier.text();
          edits.push(entry.importNode.replace(
            `import ${defaultName} from ${quoteChar}${REACT_DOM_MODULE}${quoteChar};\nimport { ${reactImportSpecifier} } from ${quoteChar}react${quoteChar};`
          ));
        } else {
          // Other specifiers remain — rebuild import without useFormState, add react import
          const otherSpecTexts = otherSpecifiers.map((s) => {
            const name = s.field("name")?.text();
            const alias = s.field("alias")?.text();
            return alias && alias !== name ? `${name} as ${alias}` : name;
          });
          const prefix = defaultIdentifier ? `${defaultIdentifier.text()}, ` : "";
          edits.push(entry.importNode.replace(
            `import ${prefix}{ ${otherSpecTexts.join(", ")} } from ${quoteChar}${REACT_DOM_MODULE}${quoteChar};\nimport { ${reactImportSpecifier} } from ${quoteChar}react${quoteChar};`
          ));
        }
      }

      needsReactImport = true;

      if (entry.localName === "useFormState") {
        // Rename all usage sites from useFormState to useActionState
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
    }

    metric.increment({ file: metricFile(root.filename()), pattern: "named-import" });
  }

  if (edits.length === 0) return null;

  // For member access cases (ReactDOM.useFormState), add import { useActionState } from "react"
  // Named import cases are already handled above (import replacement includes the react import)
  if (needsReactImport && namedUseFormStateImports.length === 0) {
    const hasReactImport = getImport(rootNode, {
      type: "named",
      name: "useActionState",
      from: REACT_MODULE,
    });
    if (!hasReactImport) {
      // Find last import statement to insert after
      const allImports = rootNode.findAll({ rule: { kind: "import_statement" } });
      const lastImport = allImports[allImports.length - 1];
      if (lastImport) {
        const endPos = lastImport.range().end.index;
        edits.push({
          startPos: endPos,
          endPos: endPos,
          insertedText: '\nimport { useActionState } from "react";',
        });
      } else {
        edits.push({
          startPos: 0,
          endPos: 0,
          insertedText: 'import { useActionState } from "react";\n',
        });
      }
    }
  }

  return rootNode.commitEdits(edits);
};

export default transform;
