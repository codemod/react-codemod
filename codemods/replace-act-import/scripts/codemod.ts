import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport, removeImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

const TEST_UTILS_MODULE = "react-dom/test-utils";
const REACT_MODULE = "react";

type TestUtilsImport = { name: string; type: "default" | "namespace" };
type NamedActImport = { importNode: SgNode<TSX>; specifier: SgNode<TSX>; alias: string | null };

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  if (text.length >= 2) return text.slice(1, -1);
  return null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function removeNodeWithComma(node: SgNode<TSX>, source: string): Edit {
  let start = node.range().start.index;
  let end = node.range().end.index;

  let i = end;
  while (isWhitespace(source[i])) i++;
  if (source[i] === ",") {
    end = i + 1;
    while (isWhitespace(source[end])) end++;
  } else {
    let j = start - 1;
    while (isWhitespace(source[j])) j--;
    if (source[j] === ",") start = j;
  }

  return { startPos: start, endPos: end, insertedText: "" };
}

function namedImportText(alias: string | null): string {
  return alias && alias !== "act" ? `act as ${alias}` : "act";
}

function countImportSpecifiers(importNode: SgNode<TSX>): number {
  return importNode.findAll({ rule: { kind: "import_specifier" } }).length;
}

function findExistingReactNamedImport(rootNode: SgNode<TSX, "program">): SgNode<TSX> | null {
  return rootNode.findAll({ rule: { kind: "import_statement" } }).find((imp) =>
    importSource(imp) === REACT_MODULE && imp.find({ rule: { kind: "named_imports" } }) !== null
  ) ?? null;
}

function findNamedActImports(rootNode: SgNode<TSX, "program">): NamedActImport[] {
  const imports: NamedActImport[] = [];

  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== TEST_UTILS_MODULE) continue;

    for (const specifier of importNode.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.field("name")?.text() !== "act") continue;
      imports.push({
        importNode,
        specifier,
        alias: specifier.field("alias")?.text() ?? null,
      });
    }
  }

  return imports;
}

function exportedSpecifierName(specifier: SgNode<TSX>): string | null {
  const identifiers = specifier.children().filter((child) =>
    child.isNamed() && child.kind() === "identifier"
  );
  return identifiers.at(-1)?.text() ?? null;
}

function hasActExportFromReact(rootNode: SgNode<TSX, "program">): boolean {
  for (const exp of rootNode.findAll({ rule: { kind: "export_statement" } })) {
    if (importSource(exp) !== REACT_MODULE) continue;

    for (const specifier of exp.findAll({ rule: { kind: "export_specifier" } })) {
      if (exportedSpecifierName(specifier) === "act") {
        return true;
      }
    }
  }

  return false;
}

function getTestUtilsImport(rootNode: SgNode<TSX, "program">): (TestUtilsImport & { importNode?: SgNode<TSX> }) | null {
  const defaultImp = getImport(rootNode, { type: "default", from: TEST_UTILS_MODULE });
  if (defaultImp) {
    const importNode = defaultImp.node.ancestors().find((a) => a.kind() === "import_statement");
    return {
      name: defaultImp.alias,
      type: defaultImp.isNamespace ? "namespace" : "default",
      importNode: importNode ?? undefined,
    };
  }

  const importDecls = rootNode.findAll({
    rule: {
      kind: "import_statement",
      has: {
        all: [
          { kind: "string", regex: "react-dom/test-utils" },
          { kind: "namespace_import" },
        ],
      },
    },
  });

  for (const imp of importDecls) {
    const namespaceImport = imp.find({ rule: { kind: "namespace_import" } });
    if (namespaceImport) {
      const ident = namespaceImport.field("name") ?? namespaceImport.find({ rule: { kind: "identifier" } });
      if (ident) return { name: ident.text(), type: "namespace", importNode: imp };
    }
  }
  return null;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("replace-act-import-migrations");

  const testUtilsImport = getTestUtilsImport(rootNode);
  const namedActImports = findNamedActImports(rootNode);

  if (testUtilsImport) {
    const actMemberCalls = rootNode.findAll({
      rule: {
        kind: "member_expression",
        has: {
          kind: "property_identifier",
          regex: "^act$",
        },
      },
    });

    if (actMemberCalls.length > 0) {
      const reactDefault = getImport(rootNode, { type: "default", from: REACT_MODULE });
      const reactNamespace = rootNode.find({
        rule: {
          kind: "import_statement",
          has: {
            all: [
              { kind: "string", regex: "^react$" },
              { kind: "namespace_import" },
            ],
          },
        },
      });
      const nsIdent = reactNamespace?.find({ rule: { kind: "namespace_import" } })?.field("name");
      const reactName = reactDefault?.alias ?? nsIdent?.text() ?? "React";

      if (testUtilsImport.importNode) {
        if (reactDefault || reactNamespace) {
          const removeEdit = removeImport(rootNode, {
            type: testUtilsImport.type,
            from: TEST_UTILS_MODULE,
          });
          if (removeEdit) edits.push(removeEdit);
        } else {
          const newImportText =
            testUtilsImport.type === "namespace"
              ? 'import * as React from "react";'
              : 'import React from "react";';
          edits.push(testUtilsImport.importNode.replace(newImportText));
        }
      }

      for (const member of actMemberCalls) {
        const objNode = member.field("object");
        if (objNode && objNode.text() === testUtilsImport.name) {
          edits.push(objNode.replace(reactName));
          metric.increment({ file: metricFile(root.filename()), pattern: "member-call" });
        }
      }
    }
  }

  if (namedActImports.length > 0) {
    const existingReactNamedImport = findExistingReactNamedImport(rootNode);
    const existingReactActSpecifiers = new Set<string>();
    if (existingReactNamedImport) {
      for (const specifier of existingReactNamedImport.findAll({ rule: { kind: "import_specifier" } })) {
        if (specifier.field("name")?.text() !== "act") continue;
        existingReactActSpecifiers.add(namedImportText(specifier.field("alias")?.text() ?? null));
      }
    }

    const wantedActSpecifiers = Array.from(
      new Set(namedActImports.map((entry) => namedImportText(entry.alias))),
    );
    const specifiersToAdd = wantedActSpecifiers.filter((text) => !existingReactActSpecifiers.has(text));

    let replacementImportId: number | null = null;
    if (existingReactNamedImport) {
      if (specifiersToAdd.length > 0) {
        const namedImports = existingReactNamedImport.find({ rule: { kind: "named_imports" } });
        if (namedImports) {
          const insertPos = namedImports.range().end.index - 1;
          edits.push({
            startPos: insertPos,
            endPos: insertPos,
            insertedText: `, ${specifiersToAdd.join(", ")}`,
          });
        }
      }
    } else if (specifiersToAdd.length > 0) {
      const firstNamedActImport = namedActImports[0]!.importNode;
      const firstImportActCount = namedActImports.filter((entry) =>
        entry.importNode.id() === firstNamedActImport.id(),
      ).length;
      const replacementText = `import { ${specifiersToAdd.join(", ")} } from "react";`;

      if (countImportSpecifiers(firstNamedActImport) === firstImportActCount) {
        edits.push(firstNamedActImport.replace(replacementText));
        replacementImportId = firstNamedActImport.id();
      } else {
        edits.push({
          startPos: firstNamedActImport.range().start.index,
          endPos: firstNamedActImport.range().start.index,
          insertedText: `${replacementText}\n`,
        });
      }
    }

    const importsById = new Map<number, { importNode: SgNode<TSX>; specifiers: SgNode<TSX>[] }>();
    for (const entry of namedActImports) {
      const current = importsById.get(entry.importNode.id());
      if (current) {
        current.specifiers.push(entry.specifier);
      } else {
        importsById.set(entry.importNode.id(), {
          importNode: entry.importNode,
          specifiers: [entry.specifier],
        });
      }
    }

    for (const [importId, group] of importsById) {
      if (replacementImportId === importId) continue;

      if (countImportSpecifiers(group.importNode) === group.specifiers.length) {
        edits.push(group.importNode.replace(""));
      } else {
        for (const specifier of group.specifiers) {
          edits.push(removeNodeWithComma(specifier, source));
        }
      }
    }

    metric.increment({ file: metricFile(root.filename()), pattern: "named-import" });
  }

  const exportDecls = rootNode.findAll({
    rule: {
      kind: "export_statement",
      has: {
        kind: "string",
        regex: "react-dom/test-utils",
      },
    },
  });

  const alreadyExportsActFromReact = hasActExportFromReact(rootNode);
  for (const exp of exportDecls) {
    const hasExportAll =
      exp.has({ rule: { kind: "namespace_export" } }) ||
      exp.children().some((c) => c.text() === "*");
    if (hasExportAll && !alreadyExportsActFromReact) {
      const insertPos = exp.range().end.index;
      edits.push({
        startPos: insertPos,
        endPos: insertPos,
        insertedText: "\nexport { act } from \"react\";",
      });
      metric.increment({ file: metricFile(root.filename()), pattern: "re-export" });
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
