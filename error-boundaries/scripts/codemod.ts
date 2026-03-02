import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const renameMetric = useMetricAtom("error-boundary-renames");

  const classLifecycleNames = rootNode.findAll({
    rule: {
      kind: "property_identifier",
      regex: "^unstable_handleError$",
      inside: {
        any: [
          {
            kind: "method_definition",
            inside: { kind: "class_body" },
          },
          {
            kind: "public_field_definition",
            inside: { kind: "class_body" },
          },
        ],
      },
    },
  });

  const createClassCalls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "identifier",
        regex: "^(createReactClass|createClass)$",
      },
    },
  });

  const createClassLifecycleNames: SgNode<TSX>[] = [];
  for (const call of createClassCalls) {
    const args = call.field("arguments");
    if (!args) continue;
    const argList = args.children().filter(
      (c) => c.kind() !== "(" && c.kind() !== ")" && c.kind() !== ",",
    );
    const configObj = argList[0];
    if (configObj) {
      createClassLifecycleNames.push(
        ...configObj.findAll({
          rule: {
            kind: "property_identifier" as const,
            regex: "^unstable_handleError$",
          },
        }),
      );
    }
  }

  for (const node of classLifecycleNames) {
    edits.push(node.replace("componentDidCatch"));
  }
  for (const node of createClassLifecycleNames) {
    edits.push(node.replace("componentDidCatch"));
  }

  if (edits.length > 0) {
    renameMetric.increment(
      {
        file: root.filename(),
      },
      edits.length,
    );
  }

  if (edits.length === 0) {
    return null;
  }

  return rootNode.commitEdits(edits);
};

export default transform;
