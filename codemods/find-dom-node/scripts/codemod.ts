import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const REACT_MODULES = new Set(["React", "react", "react/addons", "react-native"]);

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function stringValue(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  const args = call.field("arguments");
  if (!args) return [];
  return args.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function requireSource(call: SgNode<TSX>): string | null {
  const callee = call.field("function");
  if (!callee || callee.kind() !== "identifier" || callee.text() !== "require") return null;
  const firstArg = callArguments(call)[0];
  return firstArg?.kind() === "string" ? stringValue(firstArg) : null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? stringValue(source) : null;
}

function hasReact(rootNode: SgNode<TSX, "program">): boolean {
  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (REACT_MODULES.has(importSource(importNode) ?? "")) return true;
  }

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (REACT_MODULES.has(requireSource(call) ?? "")) return true;
  }

  return false;
}

function explicitRequireDisabled(value: unknown): boolean {
  return value === false || value === "false";
}

function isReactCreateClassCall(node: SgNode<TSX> | null): node is SgNode<TSX> {
  if (!node || node.kind() !== "call_expression") return false;
  const callee = node.field("function");
  return callee?.kind() === "member_expression" &&
    callee.field("object")?.kind() === "identifier" &&
    callee.field("object")?.text() === "React" &&
    callee.field("property")?.kind() === "property_identifier" &&
    callee.field("property")?.text() === "createClass";
}

function isModuleExportsMember(node: SgNode<TSX> | null): boolean {
  return node?.kind() === "member_expression" &&
    node.field("object")?.kind() === "identifier" &&
    node.field("object")?.text() === "module" &&
    node.field("property")?.kind() === "property_identifier" &&
    node.field("property")?.text() === "exports";
}

function createClassContainers(rootNode: SgNode<TSX, "program">): SgNode<TSX>[] {
  const containers: SgNode<TSX>[] = [];

  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    if (isReactCreateClassCall(declarator.field("value"))) containers.push(declarator);
  }

  for (const assignment of rootNode.findAll({ rule: { kind: "assignment_expression" } })) {
    if (isModuleExportsMember(assignment.field("left")) && isReactCreateClassCall(assignment.field("right"))) {
      containers.push(assignment);
    }
  }

  return containers;
}

function isThisRefsBase(node: SgNode<TSX> | null): boolean {
  return node?.kind() === "member_expression" &&
    node.field("object")?.kind() === "this" &&
    node.field("property")?.kind() === "property_identifier" &&
    node.field("property")?.text() === "refs";
}

function accessObject(node: SgNode<TSX> | null): SgNode<TSX> | null {
  if (!node) return null;
  if (node.kind() === "member_expression" || node.kind() === "subscript_expression") {
    return node.field("object");
  }
  return null;
}

function isThisRefsChain(node: SgNode<TSX> | null): boolean {
  if (!node) return false;
  const object = accessObject(node);
  if (!object) return false;
  if (isThisRefsBase(object)) return true;
  return isThisRefsChain(object);
}

function isDirectRefsAlias(node: SgNode<TSX> | null): boolean {
  if (!node) return false;
  const object = accessObject(node);
  return isThisRefsBase(object);
}

function isGetDOMNodeCall(call: SgNode<TSX>, objectMatcher: (node: SgNode<TSX> | null) => boolean): boolean {
  const callee = call.field("function");
  return callee?.kind() === "member_expression" &&
    callee.field("property")?.kind() === "property_identifier" &&
    callee.field("property")?.text() === "getDOMNode" &&
    objectMatcher(callee.field("object"));
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  if (!explicitRequireDisabled(options.params?.["explicit-require"]) && !hasReact(rootNode)) {
    return null;
  }

  const metric = useMetricAtom("find-dom-node-replacements");
  const edits: Edit[] = [];
  let replacements = 0;

  for (const container of createClassContainers(rootNode)) {
    for (const call of container.findAll({ rule: { kind: "call_expression" } })) {
      if (isGetDOMNodeCall(call, (node) => node?.kind() === "this")) {
        edits.push(call.replace("React.findDOMNode(this)"));
        replacements++;
        continue;
      }

      if (isGetDOMNodeCall(call, isThisRefsChain)) {
        const target = call.field("function")?.field("object");
        if (!target) continue;
        edits.push(call.replace(`React.findDOMNode(${target.text()})`));
        replacements++;
      }
    }

    for (const declarator of container.findAll({ rule: { kind: "variable_declarator" } })) {
      const name = declarator.field("name");
      const value = declarator.field("value");
      if (name?.kind() !== "identifier" || !isDirectRefsAlias(value)) continue;

      const functionExpression = declarator.ancestors().find((ancestor) => ancestor.kind() === "function_expression");
      if (!functionExpression) continue;

      for (const call of functionExpression.findAll({ rule: { kind: "call_expression" } })) {
        if (!isGetDOMNodeCall(call, (node) => node?.kind() === "identifier" && node.text() === name.text())) {
          continue;
        }

        edits.push(call.replace(`React.findDOMNode(${name.text()})`));
        replacements++;
      }
    }
  }

  if (edits.length === 0) return null;

  metric.increment({ file: metricFile(root.filename()) }, replacements);
  return rootNode.commitEdits(edits);
};

export default transform;
