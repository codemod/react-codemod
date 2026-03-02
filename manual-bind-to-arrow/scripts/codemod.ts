import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

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
  const classDecl = node.ancestors().find((a) => a.kind() === "class_declaration");
  if (!classDecl) return null;
  return classDecl.find({ rule: { kind: "class_body" } });
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
    if (left.field("object")?.text() !== "this") return false;
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
    const bindObjProp = bindObj?.kind() === "member_expression" ? bindObj.field("property") : null;
    const leftProp = left.field("property");
    return leftProp && bindObjProp && leftProp.text() === bindObjProp.text();
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
    const stmtCount = constructorBody?.children().filter((c) => c.kind() === "expression_statement" || c.kind() === "lexical_declaration" || c.kind() === "variable_declaration").length ?? 0;
    const bindAssignmentsInConstructor = constructorNode
      ? assignments
          .filter((a) => {
            const c = a.ancestors().find((anc) => anc.kind() === "method_definition" && (anc.field("name") ?? anc.field("key"))?.text() === "constructor");
            return c?.range().start.index === constructorNode.range().start.index;
          })
          .sort((a, b) => a.range().start.index - b.range().start.index)
      : [];
    const isLastBindInConstructor =
      bindAssignmentsInConstructor.length > 0 &&
      bindAssignmentsInConstructor[bindAssignmentsInConstructor.length - 1]!.range().start.index === assign.range().start.index;
    const willBeEmptyConstructor =
      stmtCount === 1 + bindAssignmentsInConstructor.length && isLastBindInConstructor && !!constructorNode;

    if (stmt) {
      const stmtEnd = stmt.range().end.index;
      const after = source.slice(stmtEnd, stmtEnd + 10);
      const trailing = after.match(/^\s*\n?/)?.[0] ?? "\n";
      edits.push({
        startPos: stmt.range().start.index,
        endPos: stmtEnd + trailing.length,
        insertedText: "",
      });
    }

    if (willBeEmptyConstructor && constructorNode) {
      const ctorEnd = constructorNode.range().end.index;
      const afterCtor = source.slice(ctorEnd, ctorEnd + 10);
      const ctorTrailing = afterCtor.match(/^\s*\n?/)?.[0] ?? "\n";
      edits.push({
        startPos: constructorNode.range().start.index,
        endPos: ctorEnd + ctorTrailing.length,
        insertedText: "",
      });
    }

    const paramsText = params ? params.text() : "()";
    const bodyText = body.text();
    const arrowReplacement = `${methodName} = ${paramsText} => ${bodyText}`;
    edits.push(methodDef.replace(arrowReplacement));

    metric.increment({ file: root.filename() });
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
