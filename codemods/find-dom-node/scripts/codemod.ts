import type { Transform, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}


const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const findDOMNodeMetric = useMetricAtom("find-dom-node-replacements");

  const reactDefaultImport = getImport(rootNode, { type: "default", from: "react" });
  const reactName = reactDefaultImport?.alias ?? "React";

  const getDOMNodeCalls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "member_expression",
        all: [
          { has: { field: "property", kind: "property_identifier", regex: "^getDOMNode$" } },
        ],
      },
    },
  });

  for (const call of getDOMNodeCalls) {
    const callee = call.field("function");
    if (!callee) continue;

    const objectNode = callee.field("object");
    if (!objectNode) continue;

    const replacement = `${reactName}.findDOMNode(${objectNode.text()})`;
    edits.push(call.replace(replacement));

    findDOMNodeMetric.increment({
      file: metricFile(root.filename()),
    });
  }

  if (edits.length === 0) return null;

  return rootNode.commitEdits(edits);
};

export default transform;
