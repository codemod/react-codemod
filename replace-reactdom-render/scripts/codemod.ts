import type { Transform, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport, addImport, removeImport } from "@jssg/utils/javascript/imports";


const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const transformMetric = useMetricAtom("reactdom-render-replacements");

  const reactDomDefaultImport = getImport(rootNode, { type: "default", from: "react-dom" });
  const reactDomRenderImport = getImport(rootNode, { type: "named", name: "render", from: "react-dom" });

  if (!reactDomDefaultImport && !reactDomRenderImport) {
    return null;
  }

  const reactDomName = reactDomDefaultImport?.alias || "ReactDOM";
  const renderName = reactDomRenderImport?.alias || "render";

  let hasTransformations = false;
  let rootIndex = 0;

  const nextRootName = (): string => {
    const name = rootIndex === 0 ? "root" : `root${rootIndex}`;
    rootIndex += 1;
    return name;
  };

  if (reactDomDefaultImport) {
    const memberRenderCalls = rootNode.findAll({
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
                regex: `^${reactDomName}$`,
              },
            },
            {
              has: {
                field: "property",
                kind: "property_identifier",
                regex: "^render$",
              },
            },
          ],
        },
      },
    });

    for (const call of memberRenderCalls) {
      const args = call.field("arguments");
      if (!args) continue;

      const argList = args.children().filter((child) => 
        child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
      );

      if (argList.length >= 2) {
        const element = argList[0];
        const container = argList[1];

        const statement = call.ancestors().find((ancestor) => 
          ancestor.kind() === "expression_statement"
        );

        if (statement) {
          const rootName = nextRootName();
          const sourceCode = rootNode.text();
          const stmtStart = statement.range().start.index;
          let indent = "";
          for (let i = stmtStart - 1; i >= 0; i--) {
            const char = sourceCode[i];
            if (char === '\n') break;
            if (char === ' ' || char === '\t') {
              indent = char + indent;
            } else {
              indent = "";
            }
          }
          const replacement = `${indent}const ${rootName} = createRoot(${container.text()});\n${indent}${rootName}.render(${element.text()});`;
          edits.push(statement.replace(replacement));
          hasTransformations = true;
          transformMetric.increment({
            pattern: "ReactDOM.render",
            file: root.filename(),
          });
        }
      }
    }
  }

  if (reactDomRenderImport) {
    const renderCalls = rootNode.findAll({
      rule: {
        kind: "call_expression",
        has: {
          field: "function",
          kind: "identifier",
          regex: `^${renderName}$`,
        },
      },
    });

    for (const call of renderCalls) {
      const args = call.field("arguments");
      if (!args) continue;

      const argList = args.children().filter((child) => 
        child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
      );

      if (argList.length >= 2) {
        const element = argList[0];
        const container = argList[1];

        const statement = call.ancestors().find((ancestor) => 
          ancestor.kind() === "expression_statement"
        );

        if (statement) {
          const rootName = nextRootName();
          const sourceCode = rootNode.text();
          const stmtStart = statement.range().start.index;
          let indent = "";
          for (let i = stmtStart - 1; i >= 0; i--) {
            const char = sourceCode[i];
            if (char === '\n') break;
            if (char === ' ' || char === '\t') {
              indent = char + indent;
            } else {
              indent = "";
            }
          }
          const replacement = `${indent}const ${rootName} = createRoot(${container.text()});\n${indent}${rootName}.render(${element.text()});`;
          edits.push(statement.replace(replacement));
          hasTransformations = true;
          transformMetric.increment({
            pattern: "render",
            file: root.filename(),
          });
        }
      }
    }
  }

  if (!hasTransformations) {
    return null;
  }

  const addEdit = addImport(rootNode, {
    type: "named",
    specifiers: [{ name: "createRoot" }],
    from: "react-dom/client",
  });
  if (addEdit) {
    edits.push(addEdit);
  }

  return rootNode.commitEdits(edits);
};

export default transform;
