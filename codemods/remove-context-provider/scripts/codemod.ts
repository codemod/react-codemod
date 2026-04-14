import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function isContextProvider(node: SgNode<TSX>): boolean {
  if (node.kind() !== "member_expression") {
    return false;
  }

  const object = node.field("object");
  const property = node.field("property");
  if (!object || object.kind() !== "identifier" || !property || property.text() !== "Provider") {
    return false;
  }

  return object.text().toLowerCase().includes("context");
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("remove-context-provider-replacements");
  let replacements = 0;

  for (const member of rootNode.findAll({ rule: { kind: "member_expression" } })) {
    const parent = member.parent();
    if (!parent) {
      continue;
    }

    const isJsxName = parent.kind() === "jsx_opening_element" || parent.kind() === "jsx_closing_element";
    if (!isJsxName || !isContextProvider(member)) {
      continue;
    }

    const object = member.field("object");
    if (!object) {
      continue;
    }

    edits.push(member.replace(object.text()));
    replacements++;
  }

  if (edits.length === 0) {
    return null;
  }

  metric.increment({ file: metricFile(root.filename()) }, replacements);
  return rootNode.commitEdits(edits);
};

export default transform;
