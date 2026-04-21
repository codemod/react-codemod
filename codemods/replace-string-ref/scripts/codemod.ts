import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}


function isInsideReactClassComponent(
  node: SgNode<TSX>,
  reactName: string,
  componentNamesList: string[],
): boolean {
  const classDecl = node.ancestors().find((a) => a.kind() === "class_declaration");
  if (!classDecl) return false;
  
  const heritage = classDecl.children().find((c) => c.kind() === "class_heritage");
  if (!heritage) return false;

  const extendsClause = heritage.children().find((child) => child.kind() === "extends_clause");
  const directSuperclass = extendsClause?.children().find(
    (child) => child.isNamed() && child.kind() !== "type_arguments",
  );
  if (!directSuperclass) return false;

  if (directSuperclass.kind() === "member_expression") {
    const object = directSuperclass.field("object");
    const property = directSuperclass.field("property");
    return !!(
      object &&
      property &&
      object.text() === reactName &&
      (property.text() === "Component" || property.text() === "PureComponent")
    );
  }

  if (directSuperclass.kind() === "identifier") {
    return componentNamesList.includes(directSuperclass.text());
  }

  return false;
}

function isValidIdentifierName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function callbackRefText(refName: string): string {
  const assignmentTarget = isValidIdentifierName(refName)
    ? `this.refs.${refName}`
    : `this.refs[${JSON.stringify(refName)}]`;
  return `ref={(ref) => {
        ${assignmentTarget} = ref;
      }}`;
}

function namedReturnExpression(returnStmt: SgNode<TSX>): SgNode<TSX> | null {
  return returnStmt.children().find((child) => child.isNamed() && child.kind() !== "comment") ?? null;
}

function isFragmentElement(node: SgNode<TSX>): boolean {
  if (node.kind() !== "jsx_element") return false;
  const opening = node.children().find((child) => child.kind() === "jsx_opening_element");
  if (!opening) return false;
  const tagName = opening.children().find((child) =>
    child.kind() === "identifier" || child.kind() === "property_identifier"
  );
  return !tagName;
}

function shouldWrapReturnExpression(node: SgNode<TSX> | null): node is SgNode<TSX> {
  if (!node) return false;
  if (node.kind() === "jsx_self_closing_element") return true;
  if (node.kind() === "jsx_element") return !isFragmentElement(node);
  return false;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const transformMetric = useMetricAtom("string-ref-replacements");
  const refNames: string[] = [];
  const wrappedJsxStarts = new Set<number>();

  const reactDefault = getImport(rootNode, { type: "default", from: "react" });
  const componentImport = getImport(rootNode, { type: "named", name: "Component", from: "react" });
  const pureImport = getImport(rootNode, { type: "named", name: "PureComponent", from: "react" });
  const reactName = reactDefault?.alias ?? "React";
  const componentNames = new Set<string>();
  if (componentImport) componentNames.add(componentImport.alias);
  if (pureImport) componentNames.add(pureImport.alias);
  const componentNamesList = Array.from(componentNames);

  const stringRefs = rootNode.findAll({
    rule: {
      kind: "jsx_attribute",
      all: [
        { has: { kind: "property_identifier", regex: "^ref$" } },
        { has: { kind: "string" } },
      ],
    },
  });

  for (const refAttr of stringRefs) {
    if (!isInsideReactClassComponent(refAttr, reactName, componentNamesList)) continue;
    const stringValue = refAttr.find({
      rule: {
        kind: "string",
      },
    });

    if (!stringValue) continue;

    const stringFragment = stringValue.find({
      rule: {
        kind: "string_fragment",
      },
    });

    if (!stringFragment) continue;

    const refName = stringFragment.text();
    const callbackRef = callbackRefText(refName);

    edits.push(refAttr.replace(callbackRef));
    const returnStmt = refAttr.ancestors().find((a) => a.kind() === "return_statement");
    const returnExpr = returnStmt ? namedReturnExpression(returnStmt) : null;
    if (
      returnExpr &&
      returnStmt &&
      shouldWrapReturnExpression(returnExpr) &&
      returnExpr.parent()?.kind() !== "parenthesized_expression" &&
      !wrappedJsxStarts.has(returnExpr.range().start.index)
    ) {
      wrappedJsxStarts.add(returnExpr.range().start.index);
      edits.push({
        startPos: returnExpr.range().start.index,
        endPos: returnExpr.range().start.index,
        insertedText: "(",
      });
      edits.push({
        startPos: returnExpr.range().end.index,
        endPos: returnExpr.range().end.index,
        insertedText: ")",
      });
    }
    refNames.push(refName);
  }

  if (refNames.length > 0) {
    transformMetric.increment({
      refs: refNames.sort().join(","),
      file: metricFile(root.filename()),
    }, refNames.length);
  }

  if (edits.length === 0) {
    return null;
  }

  return rootNode.commitEdits(edits);
};

export default transform;
