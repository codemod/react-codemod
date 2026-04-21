import type { Transform, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}


const DEPRECATED_LIFECYCLES = {
  componentWillMount: "UNSAFE_componentWillMount",
  componentWillReceiveProps: "UNSAFE_componentWillReceiveProps",
  componentWillUpdate: "UNSAFE_componentWillUpdate",
} as const;

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];


  const transformMetric = useMetricAtom("lifecycle-renames");
  const renameCount: Record<string, number> = {};

  for (const [oldName, newName] of Object.entries(DEPRECATED_LIFECYCLES)) {
    const methodDefs = rootNode.findAll({
      rule: {
        any: [
          {
            kind: "method_definition",
            has: {
              field: "name",
              kind: "property_identifier",
              regex: `^${oldName}$`,
            },
          },
          {
            kind: "public_field_definition",
            has: {
              field: "name",
              kind: "property_identifier",
              regex: `^${oldName}$`,
            },
          },
        ],
      },
    });

    for (const method of methodDefs) {
      const nameNode = method.find({
        rule: {
          kind: "property_identifier",
          regex: `^${oldName}$`,
        },
      });

      if (nameNode) {
        edits.push(nameNode.replace(newName));
        renameCount[oldName] = (renameCount[oldName] || 0) + 1;
      }
    }

    const objectProps = rootNode.findAll({
      rule: {
        kind: "pair",
        has: {
          field: "key",
          kind: "property_identifier",
          regex: `^${oldName}$`,
        },
      },
    });

    for (const prop of objectProps) {
      const keyNode = prop.find({
        rule: {
          kind: "property_identifier",
          regex: `^${oldName}$`,
        },
      });

      if (keyNode) {
        edits.push(keyNode.replace(newName));
        renameCount[oldName] = (renameCount[oldName] || 0) + 1;
      }
    }

    const memberExprs = rootNode.findAll({
      rule: {
        kind: "member_expression",
        has: {
          field: "property",
          kind: "property_identifier",
          regex: `^${oldName}$`,
        },
      },
    });

    for (const memberExpr of memberExprs) {
      const propertyNode = memberExpr.find({
        rule: {
          kind: "property_identifier",
          regex: `^${oldName}$`,
        },
      });

      if (propertyNode) {
        edits.push(propertyNode.replace(newName));
        renameCount[oldName] = (renameCount[oldName] || 0) + 1;
      }
    }
  }

  if (Object.keys(renameCount).length > 0) {
    const lifecycles = Object.keys(renameCount).sort().join(",");
    const total = Object.values(renameCount).reduce((a, b) => a + b, 0);
    transformMetric.increment({
      lifecycles,
      file: metricFile(root.filename()),
    }, total);
  }

  if (edits.length === 0) {
    return null;
  }

  return rootNode.commitEdits(edits);
};

export default transform;
