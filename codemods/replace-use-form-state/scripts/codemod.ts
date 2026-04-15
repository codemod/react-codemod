import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}


const REACT_DOM_MODULE = "react-dom";

type ReactDOMImport = { name: string; type: "default" | "namespace" };

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  if (!source) return null;
  const fragment = source.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = source.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function getReactDOMImport(rootNode: SgNode<TSX, "program">): ReactDOMImport | null {
  const defaultImp = getImport(rootNode, { type: "default", from: REACT_DOM_MODULE });
  if (defaultImp) return { name: defaultImp.alias, type: "default" };

  const importDecls = rootNode.findAll({
    rule: {
      kind: "import_statement",
      has: {
        all: [
          { kind: "string", regex: "^react-dom$" },
          { kind: "namespace_import" },
        ],
      },
    },
  });

  for (const imp of importDecls) {
    const namespaceImport = imp.find({ rule: { kind: "namespace_import" } });
    if (namespaceImport) {
      const ident = namespaceImport.field("name") ?? namespaceImport.find({ rule: { kind: "identifier" } });
      if (ident) return { name: ident.text(), type: "namespace" };
    }
  }
  return null;
}

function firstReactDOMImport(rootNode: SgNode<TSX, "program">): SgNode<TSX> | null {
  return rootNode.findAll({ rule: { kind: "import_statement" } })
    .find((node) => importSource(node) === REACT_DOM_MODULE) ?? null;
}

function matchingUseFormStateSpecifier(importNode: SgNode<TSX>): SgNode<TSX> | null {
  return importNode.findAll({
    rule: {
      kind: "import_specifier",
    },
  }).find((spec) => spec.field("name")?.text() === "useFormState") ?? null;
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

  const reactDOMImport = getReactDOMImport(rootNode);

  if (reactDOMImport) {
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
      if (objNode && objNode.text() === reactDOMImport.name) {
        const propNode = member.field("property");
        if (propNode) {
          edits.push(propNode.replace("useActionState"));
          metric.increment({ file: metricFile(root.filename()), pattern: "member-call" });
        }
      }
    }
  }

  const importNode = firstReactDOMImport(rootNode);
  const specifier = importNode ? matchingUseFormStateSpecifier(importNode) : null;
  if (!specifier) {
    if (edits.length === 0) return null;
    return rootNode.commitEdits(edits);
  }

  const localName = specifier.field("alias")?.text() ?? specifier.field("name")?.text() ?? "useFormState";
  edits.push(specifier.replace(replacementImportSpecifierText(localName)));

  if (localName === "useFormState") {
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
  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
