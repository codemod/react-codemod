import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}


function methodDefByNameRule(methodName: string) {
  const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    kind: "method_definition" as const,
    has: {
      field: "name",
      any: [
        { kind: "property_identifier" as const, regex: `^${escaped}$` },
        { kind: "identifier" as const, regex: `^${escaped}$` },
      ],
    },
  };
}

const USES_ARGUMENTS_RULE = {
  has: { kind: "identifier" as const, regex: "^arguments$" },
};

function getClassBody(node: SgNode<TSX>): SgNode<TSX> | null {
  const classDecl = node.ancestors().find((a) =>
    a.kind() === "class_declaration" || a.kind() === "class"
  );
  if (!classDecl) return null;
  return classDecl.find({ rule: { kind: "class_body" } });
}

function memberPropertyName(node: SgNode<TSX> | null): string | null {
  return node?.kind() === "member_expression" ? (node.field("property")?.text() ?? null) : null;
}

function memberObject(node: SgNode<TSX> | null): SgNode<TSX> | null {
  return node?.kind() === "member_expression" ? node.field("object") : null;
}

function isThisLikeObject(node: SgNode<TSX> | null): boolean {
  if (!node) return false;
  if (node.text() === "this" || node.text() === "self") return true;
  return node.kind() === "parenthesized_expression" && node.find({ rule: { kind: "this" } }) !== null;
}

function isSuperStatement(node: SgNode<TSX>): boolean {
  const call = node.find({ rule: { kind: "call_expression" } });
  return node.kind() === "expression_statement" && call?.field("function")?.text() === "super";
}

function statementForAssignment(assign: SgNode<TSX>): SgNode<TSX> | null {
  return assign.ancestors().find((a) => a.kind() === "expression_statement") ?? null;
}

function lineStartIndex(source: string, index: number): number {
  let cursor = index;
  while (cursor > 0 && source[cursor - 1] !== "\n" && source[cursor - 1] !== "\r") {
    cursor--;
  }
  return cursor;
}

function statementRemovalEdit(source: string, node: SgNode<TSX>): Edit {
  const startIndex = node.range().start.index;
  const lineStart = lineStartIndex(source, startIndex);
  const leading = source.slice(lineStart, startIndex);
  const removalStart = /^[\t ]*$/.test(leading) ? lineStart : startIndex;
  const endIndex = node.range().end.index;
  const trailing = source.slice(endIndex).match(/^[\t ]*(?:\r\n|\n|\r)?/)?.[0] ?? "";

  return {
    startPos: removalStart,
    endPos: endIndex + trailing.length,
    insertedText: "",
  };
}

function nodeRemovalEdit(source: string, node: SgNode<TSX>): Edit {
  const startIndex = node.range().start.index;
  const lineStart = lineStartIndex(source, startIndex);
  const leading = source.slice(lineStart, startIndex);
  const removalStart = /^[\t ]*$/.test(leading) ? lineStart : startIndex;
  const endIndex = node.range().end.index;
  const trailing = source.slice(endIndex).match(/^[\t ]*(?:\r\n|\n|\r)?/)?.[0] ?? "";

  return {
    startPos: removalStart,
    endPos: endIndex + trailing.length,
    insertedText: "",
  };
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("manual-bind-to-arrow-transforms");

  const allAssignments = rootNode.findAll({ rule: { kind: "assignment_expression" } });
  const allBindAssignments = allAssignments.filter((assign) => {
    const right = assign.field("right");
    if (!right || right.kind() !== "call_expression") return false;
    const callee = right.field("function");
    if (!callee || callee.kind() !== "member_expression") return false;
    if (callee.field("property")?.text() !== "bind") return false;
    const left = assign.field("left");
    if (!left || left.kind() !== "member_expression") return false;
    if (!isThisLikeObject(left.field("object"))) return false;
    return true;
  });
  const assignmentsInConstructors = allBindAssignments.filter((assign) => {
    const ctor = assign.ancestors().find((a) => a.kind() === "method_definition" && (a.field("name") ?? a.field("key"))?.text() === "constructor");
    return !!ctor;
  });

  const assignments = assignmentsInConstructors.filter((assign) => {
    const left = assign.field("left");
    const right = assign.field("right");
    if (!left || !right) return false;
    const bindCallee = right.field("function");
    if (!bindCallee || bindCallee.kind() !== "member_expression") return false;
    const bindObj = bindCallee.field("object");
    if (!bindObj || memberObject(bindObj)?.text() !== "this") return false;
    const bindObjProp = memberPropertyName(bindObj);
    const leftProp = memberPropertyName(left);
    return !!leftProp && !!bindObjProp && leftProp === bindObjProp;
  });

  for (const assign of assignments) {
    const left = assign.field("left");
    const leftProp = left?.field("property");
    if (!leftProp) continue;
    const methodName = leftProp.text();

    const classBody = getClassBody(assign);
    if (!classBody) continue;

    const methods = classBody.findAll({ rule: methodDefByNameRule(methodName) });
    const methodDef = methods[0];
    if (!methodDef || methodDef.find({ rule: USES_ARGUMENTS_RULE })) continue;

    const params = methodDef.field("parameters");
    const body = methodDef.field("body");
    if (!body) continue;
    const stmt = assign.ancestors().find((a) => a.kind() === "expression_statement");
    const constructorNode = assign.ancestors().find((a) => a.kind() === "method_definition" && (a.field("name") ?? a.field("key"))?.text() === "constructor");
    const constructorBody = constructorNode?.field("body");
    const bindAssignmentsInConstructor = constructorNode
      ? assignments
          .filter((a) => {
            const c = a.ancestors().find((anc) => anc.kind() === "method_definition" && (anc.field("name") ?? anc.field("key"))?.text() === "constructor");
            return c?.range().start.index === constructorNode.range().start.index;
          })
          .sort((a, b) => a.range().start.index - b.range().start.index)
      : [];
    const selfIdentifiers = constructorNode?.findAll({ rule: { kind: "identifier", regex: "^self$" } }) ?? [];
    const selfDeclaration = constructorNode?.findAll({ rule: { kind: "lexical_declaration" } }).find((decl) =>
      decl.find({ rule: { kind: "variable_declarator", has: { field: "name", kind: "identifier", regex: "^self$" } } }) !== null
    ) ?? null;
    const canRemoveSelfDeclaration =
      left?.field("object")?.text() === "self" && selfIdentifiers.length <= 2 && !!selfDeclaration;
    const removableBindStatements = new Set(
      bindAssignmentsInConstructor
        .map(statementForAssignment)
        .filter((node): node is SgNode<TSX> => node !== null)
        .map((node) => node.range().start.index),
    );
    const willBeEmptyConstructor =
      !!constructorNode &&
      !!constructorBody &&
      constructorBody.children()
        .filter((c) => c.isNamed())
        .every((child) =>
          isSuperStatement(child) ||
          removableBindStatements.has(child.range().start.index) ||
          (canRemoveSelfDeclaration && selfDeclaration?.range().start.index === child.range().start.index)
        );

    if (willBeEmptyConstructor && constructorNode) {
      edits.push(nodeRemovalEdit(source, constructorNode));
    } else if (stmt) {
      edits.push(statementRemovalEdit(source, stmt));

      if (canRemoveSelfDeclaration && selfDeclaration) {
        edits.push(statementRemovalEdit(source, selfDeclaration));
      }
    }

    const paramsText = params ? params.text() : "()";
    const returnTypeText = methodDef.field("return_type")?.text() ?? "";
    const bodyText = body.text();
    const arrowReplacement = `${methodName} = ${paramsText}${returnTypeText} => ${bodyText};`;
    edits.push(methodDef.replace(arrowReplacement));

    metric.increment({ file: metricFile(root.filename()) });
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
