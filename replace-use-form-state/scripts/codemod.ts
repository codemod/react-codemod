import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

const REACT_DOM_MODULE = "react-dom";

type ReactDOMImport = { name: string; type: "default" | "namespace" };

function getReactDOMImport(rootNode: SgNode<TSX>): ReactDOMImport | null {
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

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("replace-use-form-state-migrations");

  const reactDOMImport = getReactDOMImport(rootNode);
  const useFormStateNamedImport = getImport(rootNode, {
    type: "named",
    name: "useFormState",
    from: REACT_DOM_MODULE,
  });

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
          metric.increment({ file: root.filename(), pattern: "member-call" });
        }
      }
    }
  }

  if (useFormStateNamedImport && !useFormStateNamedImport.isNamespace) {
    const importNode = useFormStateNamedImport.node.ancestors().find(
      (a) => a.kind() === "import_statement"
    );
    if (importNode) {
      const specifiers = importNode.findAll({
        rule: {
          kind: "import_specifier",
          has: {
            kind: "identifier",
            regex: "^useFormState$",
          },
        },
      });
      for (const spec of specifiers) {
        const nameNode = spec.field("name");
        if (nameNode && nameNode.text() === "useFormState") {
          edits.push(nameNode.replace("useActionState"));
        }
      }
    }

    const localName = useFormStateNamedImport.alias;
    if (localName === "useFormState") {
      const refs = useFormStateNamedImport.node.references();
      for (const fileRef of refs) {
        if (fileRef.root.filename() !== root.filename()) continue;
        for (const node of fileRef.nodes) {
          const inImport = node.ancestors().some((a) => a.kind() === "import_statement");
          if (!inImport) {
            edits.push(node.replace("useActionState"));
          }
        }
      }
    }
    metric.increment({ file: root.filename(), pattern: "named-import" });
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
