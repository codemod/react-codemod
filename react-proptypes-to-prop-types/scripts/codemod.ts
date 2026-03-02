import type { Transform, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const propTypesMetric = useMetricAtom("react-proptypes-migrations");

  const reactDefaultImport = getImport(rootNode, { type: "default", from: "react" });
  const reactName = reactDefaultImport?.alias ?? "React";

  const propTypesImport = getImport(rootNode, { type: "default", from: "prop-types" });
  const propTypesName = propTypesImport?.alias ?? "PropTypes";

  // Find member_expressions: React.PropTypes (object=React, property=PropTypes)
  const reactPropTypesRefs = rootNode.findAll({
    rule: {
      kind: "member_expression",
      all: [
        { has: { field: "object", kind: "identifier", regex: `^${reactName}$` } },
        { has: { field: "property", kind: "property_identifier", regex: "^PropTypes$" } },
      ],
    },
  });

  for (const ref of reactPropTypesRefs) {
    edits.push(ref.replace(propTypesName));
    propTypesMetric.increment({
      file: root.filename(),
    });
  }

  if (edits.length === 0) return null;

  // Add prop-types import if not present (insert after first import)
  if (!propTypesImport) {
    const firstImport = rootNode.find({
      rule: { kind: "import_statement" },
    });
    if (firstImport) {
      const importLine = `import ${propTypesName} from "prop-types";\n`;
      const insertPos = firstImport.range().start.index;
      edits.push({ startPos: insertPos, endPos: insertPos, insertedText: importLine });
    }
  }

  return rootNode.commitEdits(edits);
};

export default transform;
