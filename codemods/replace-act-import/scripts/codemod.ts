import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport, addImport, removeImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

const TEST_UTILS_MODULE = "react-dom/test-utils";
const REACT_MODULE = "react";

type TestUtilsImport = { name: string; type: "default" | "namespace" };

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
  const edits: Edit[] = [];
  const metric = useMetricAtom("replace-act-import-migrations");

  const testUtilsImport = getTestUtilsImport(rootNode);
  const actNamedImport = getImport(rootNode, { type: "named", name: "act", from: TEST_UTILS_MODULE });

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

  if (actNamedImport && !actNamedImport.isNamespace) {
    const importNode = actNamedImport.node.ancestors().find((a) => a.kind() === "import_statement");
    const specifierCount = importNode?.findAll({ rule: { kind: "import_specifier" } }).length ?? 0;
    if (importNode && specifierCount === 1) {
      const alias =
        actNamedImport.alias && actNamedImport.alias !== "act"
          ? `act as ${actNamedImport.alias}`
          : "act";
      const existingReactNamedImport = rootNode.findAll({ rule: { kind: "import_statement" } }).find((imp) =>
        imp.find({ rule: { kind: "string", has: { kind: "string_fragment", regex: "^react$" } } }) !== null &&
        imp.find({ rule: { kind: "named_imports" } }) !== null
      );
      if (existingReactNamedImport) {
        const namedImports = existingReactNamedImport.find({ rule: { kind: "named_imports" } });
        if (namedImports) {
          const insertPos = namedImports.range().end.index - 1;
          edits.push({ startPos: insertPos, endPos: insertPos, insertedText: `, ${alias}` });
        }
        edits.push(importNode.replace(""));
      } else {
        edits.push(importNode.replace(`import { ${alias} } from "react";`));

      }
    } else {
      const addEdit = addImport(rootNode, {
        type: "named",
        specifiers: [{ name: "act", alias: actNamedImport.alias }],
        from: REACT_MODULE,
      });
      if (addEdit) edits.push(addEdit);

      const removeEdit = removeImport(rootNode, {
        type: "named",
        specifiers: ["act"],
        from: TEST_UTILS_MODULE,
      });
      if (removeEdit) edits.push(removeEdit);
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

  for (const exp of exportDecls) {
    const hasExportAll =
      exp.has({ rule: { kind: "namespace_export" } }) ||
      exp.children().some((c) => c.text() === "*");
    if (hasExportAll) {
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
