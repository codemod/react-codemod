import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport, removeImport } from "@jssg/utils/javascript/imports";

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const transformMetric = useMetricAtom("react-import-updates");

  const reactDefaultImport = getImport(rootNode, { type: "default", from: "react" });
  
  if (!reactDefaultImport) {
    return null; 
  }

  const reactName = reactDefaultImport.alias;

  const reactMemberUsages = new Map<string, SgNode<TSX>[]>();

  const memberExpressions = rootNode.findAll({
    rule: {
      kind: "member_expression",
      has: {
        field: "object",
        kind: "identifier",
        regex: `^${reactName}$`,
      },
    },
  });

  for (const memberExpr of memberExpressions) {
    const property = memberExpr.find({
      rule: {
        kind: "property_identifier",
      },
    });

    if (property) {
      const propName = property.text();
      if (!reactMemberUsages.has(propName)) {
        reactMemberUsages.set(propName, []);
      }
      reactMemberUsages.get(propName)!.push(memberExpr);
    }
  }


  const reactAsValue = rootNode.findAll({
    rule: {
      kind: "identifier",
      regex: `^${reactName}$`,
    },
  }).filter((node) => {
    const parent = node.parent();
    if (!parent) return true;
    
    if (parent.kind() === "member_expression") {
      const objectField = parent.field("object");
      if (objectField && objectField.id() === node.id()) {
        return false; 
      }
    }

    const ancestors = node.ancestors();
    for (const ancestor of ancestors) {
      if (ancestor.kind() === "import_statement") {
        return false;
      }
    }

    return true;
  });

  const isReactUsedAsValue = reactAsValue.length > 0;

  if (isReactUsedAsValue) {
    const newImportText = `import * as ${reactName} from "react";`;
    const importStatement = reactDefaultImport.node.ancestors().find(
      (a) => a.kind() === "import_statement"
    );
    if (importStatement) {
      edits.push(importStatement.replace(newImportText));
    }

    transformMetric.increment({
      action: "convert-to-namespace",
      reason: "react-used-as-value",
      file: root.filename(),
    });
  } else if (reactMemberUsages.size > 0) {
    const namedImportsToAdd: string[] = [];
    let totalConversions = 0;

    for (const [memberName, usages] of reactMemberUsages) {
      namedImportsToAdd.push(memberName);

      for (const usage of usages) {
        edits.push(usage.replace(memberName));
      }

      totalConversions += usages.length;
    }

    const namedList = [...new Set(namedImportsToAdd)].sort().join(", ");
    const newImportText = `import { ${namedList} } from "react";`;
    const importStatement = reactDefaultImport.node.ancestors().find(
      (a) => a.kind() === "import_statement"
    );
    if (importStatement) {
      edits.push(importStatement.replace(newImportText));
    }

    transformMetric.increment({
      action: "convert-member-to-named",
      members: namedList,
      file: root.filename(),
    }, totalConversions);
  } else {

    const removeEdit = removeImport(rootNode, {
      type: "default",
      from: "react",
    });
    if (removeEdit) {
      edits.push(removeEdit);
      transformMetric.increment({
        action: "remove-default-import",
        reason: "only-jsx-usage",
        file: root.filename(),
      });
    }
  }

  if (edits.length === 0) {
    return null;
  }

  return rootNode.commitEdits(edits);
};

export default transform;
