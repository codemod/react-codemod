import type { Transform, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport, addImport, removeImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}


const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const transformMetric = useMetricAtom("use-context-transformations");

  const reactDefaultImport = getImport(rootNode, { type: "default", from: "react" });
  const reactDefaultName = reactDefaultImport?.alias || "React";

  const useContextImport = getImport(rootNode, { type: "named", name: "useContext", from: "react" });
  const useContextLocalName = useContextImport?.alias;

  let needsUseNamedImport = false;
  
  const reactMemberCalls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "member_expression",
        all: [
          {
            has: {
              field: "object",
              kind: "identifier",
              regex: `^${reactDefaultName}$`,
            },
          },
          {
            has: {
              field: "property",
              kind: "property_identifier",
              regex: "^useContext$",
            },
          },
        ],
      },
    },
  });

  for (const call of reactMemberCalls) {
    const propertyNode = call.find({
      rule: {
        kind: "property_identifier",
        regex: "^useContext$",
      },
    });

    if (propertyNode) {
      edits.push(propertyNode.replace("use"));
      transformMetric.increment({ 
        pattern: "React.useContext", 
        file: metricFile(root.filename()) 
      });
    }
  }

  if (useContextLocalName) {
    const useContextCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: `^${useContextLocalName}$`,
        },
      },
    });

    const hasUseContextCalls = useContextCalls.length > 0;
    
    if (hasUseContextCalls) {
      const isAliased = useContextImport && useContextImport.alias !== "useContext";
      
      if (!isAliased) {
        for (const call of useContextCalls) {
          const callee = call.find({
            rule: {
              kind: "identifier",
              regex: `^${useContextLocalName}$`,
            },
          });

          if (callee) {
            edits.push(callee.replace("use"));
            transformMetric.increment({ 
              pattern: "useContext", 
              file: metricFile(root.filename()) 
            });
          }
        }
      } else {
        transformMetric.increment({ 
          pattern: "useContext (aliased)", 
          file: metricFile(root.filename()) 
        }, useContextCalls.length);
      }
      
      needsUseNamedImport = true;
    }
  }

  if (needsUseNamedImport && useContextImport) {
    const importStatement = useContextImport.node.ancestors().find(
      (a) => a.kind() === "import_statement"
    );
    
    if (importStatement) {
      const importText = importStatement.text();
      let newImportText: string;
      
      if (useContextImport.alias !== "useContext") {
        newImportText = importText.replace(
          new RegExp(`\\buseContext\\s+as\\s+${useContextImport.alias}\\b`),
          `use as ${useContextImport.alias}`
        );
      } else {
        newImportText = importText.replace(/\buseContext\b/, "use");
      }
      
      edits.push(importStatement.replace(newImportText));
    }
  }

  if (edits.length === 0) {
    return null;
  }

  return rootNode.commitEdits(edits);
};

export default transform;
