import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getImport, removeImport } from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function namedChildren(node: SgNode<TSX> | null): SgNode<TSX>[] {
  if (!node) {
    return [];
  }

  return node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function firstNamedChild(node: SgNode<TSX> | null): SgNode<TSX> | null {
  return namedChildren(node)[0] ?? null;
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  return namedChildren(call.field("arguments"));
}

function functionParameters(fn: SgNode<TSX>): SgNode<TSX>[] {
  return namedChildren(fn.field("parameters"));
}

function parameterPattern(param: SgNode<TSX>): SgNode<TSX> | null {
  return firstNamedChild(param);
}

function parameterTypeAnnotation(param: SgNode<TSX>): SgNode<TSX> | null {
  const children = namedChildren(param);
  return children.length > 1 ? children[1] ?? null : null;
}

function legacyLiteralOrReferenceType(node: SgNode<TSX> | null): SgNode<TSX> | null {
  const directNode = node && (
    node.kind() === "type_identifier" ||
    node.kind() === "nested_type_identifier" ||
    node.kind() === "object_type" ||
    node.kind() === "generic_type"
  ) ? node : null;
  const typeNode = directNode ?? (
    node && (node.kind() === "type_annotation" || node.kind() === "type_arguments")
      ? firstNamedChild(node)
      : null
  );
  if (!typeNode) {
    return null;
  }

  return (
    typeNode.kind() === "type_identifier" ||
    typeNode.kind() === "nested_type_identifier" ||
    typeNode.kind() === "object_type" ||
    typeNode.kind() === "generic_type"
  ) ? typeNode : null;
}

function legacyReferenceType(node: SgNode<TSX> | null): SgNode<TSX> | null {
  const directNode = node && (
    node.kind() === "type_identifier" ||
    node.kind() === "nested_type_identifier" ||
    node.kind() === "generic_type"
  ) ? node : null;
  const typeNode = directNode ?? (
    node && (node.kind() === "type_annotation" || node.kind() === "type_arguments")
      ? firstNamedChild(node)
      : null
  );
  if (!typeNode) {
    return null;
  }

  return (
    typeNode.kind() === "type_identifier" ||
    typeNode.kind() === "nested_type_identifier" ||
    typeNode.kind() === "generic_type"
  ) ? typeNode : null;
}

function stripLeadingColon(text: string): string {
  return text.startsWith(":") ? text.slice(1).trim() : text.trim();
}

function callTypeArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  const typeArguments = call.children().find((child) => child.kind() === "type_arguments");
  return namedChildren(typeArguments ?? null);
}

function refTypeFromForwardedRef(typeAnnotation: SgNode<TSX> | null): string | null {
  const typeNode = legacyReferenceType(typeAnnotation);
  if (!typeNode || typeNode.kind() !== "generic_type") {
    return null;
  }

  const children = namedChildren(typeNode);
  const typeNameNode = children[0];
  const genericArgs = children[1];
  if (!typeNameNode || !genericArgs) {
    return null;
  }

  const typeNameChildren = namedChildren(typeNameNode);
  const lastTypeName = typeNameChildren[typeNameChildren.length - 1] ?? typeNameNode;
  if (lastTypeName.text() !== "ForwardedRef") {
    return null;
  }

  const refType = legacyReferenceType(genericArgs);
  return refType?.text() ?? null;
}

function refBindingEntry(refName: string): string {
  return refName === "ref" ? "ref" : `ref: ${refName}`;
}

function objectPatternInnerText(pattern: SgNode<TSX>): string {
  const text = pattern.text().trim();
  return text.startsWith("{") && text.endsWith("}") ? text.slice(1, -1).trim() : text;
}

function propsPatternText(propsParam: SgNode<TSX>, refName: string): string | null {
  const pattern = parameterPattern(propsParam);
  if (!pattern) {
    return null;
  }

  if (pattern.kind() === "identifier") {
    return `{ ${refBindingEntry(refName)}, ...${pattern.text()} }`;
  }

  if (pattern.kind() === "object_pattern") {
    const inner = objectPatternInnerText(pattern);
    return inner.length > 0
      ? `{ ${refBindingEntry(refName)}, ${inner} }`
      : `{ ${refBindingEntry(refName)} }`;
  }

  return null;
}

function paramTypeText(propsParam: SgNode<TSX>, call: SgNode<TSX>, refParam: SgNode<TSX>): string | null {
  const typeArgs = callTypeArguments(call);
  const refTypeArg = typeArgs[0] ?? null;
  const propTypeArg = typeArgs[1] ?? null;
  const legacyRefTypeArg = legacyReferenceType(refTypeArg);
  const legacyPropTypeArg = legacyLiteralOrReferenceType(propTypeArg);
  if (legacyRefTypeArg && legacyPropTypeArg) {
    return `${legacyPropTypeArg.text()} & { ref: React.RefObject<${legacyRefTypeArg.text()}> }`;
  }

  const propsType = legacyLiteralOrReferenceType(parameterTypeAnnotation(propsParam));
  if (!propsType) {
    return null;
  }

  const refType = refTypeFromForwardedRef(parameterTypeAnnotation(refParam)) ?? "unknown";
  return `${propsType.text()} & { ref: React.RefObject<${refType}> }`;
}

function bodyText(fn: SgNode<TSX>): string | null {
  return fn.field("body")?.text() ?? null;
}

function functionName(fn: SgNode<TSX>): string {
  return fn.children().find((child) => child.kind() === "identifier")?.text() ?? "";
}

function buildReplacement(call: SgNode<TSX>): string | null {
  const renderFunction = callArguments(call)[0];
  if (!renderFunction || (renderFunction.kind() !== "function_expression" && renderFunction.kind() !== "arrow_function")) {
    return null;
  }

  const params = functionParameters(renderFunction);
  const propsParam = params[0];
  const refParam = params[1];
  if (!propsParam || !refParam) {
    return null;
  }

  const refPattern = parameterPattern(refParam);
  if (!refPattern || refPattern.kind() !== "identifier") {
    return null;
  }

  const propsText = propsPatternText(propsParam, refPattern.text());
  const fnBodyText = bodyText(renderFunction);
  if (!propsText || !fnBodyText) {
    return null;
  }

  const annotation = paramTypeText(propsParam, call, refParam);
  const finalParam = annotation ? `${propsText}: ${annotation}` : propsText;

  if (renderFunction.kind() === "function_expression") {
    const name = functionName(renderFunction);
    const namePart = name.length > 0 ? ` ${name}` : "";
    return `function${namePart}(${finalParam}) ${fnBodyText}`;
  }

  return `(${finalParam}) => ${fnBodyText}`;
}

function isForwardRefIdentifierCall(call: SgNode<TSX>, localName: string | null): boolean {
  if (!localName) {
    return false;
  }

  const callee = call.field("function");
  return callee?.kind() === "identifier" && callee.text() === localName;
}

function isForwardRefMemberCall(call: SgNode<TSX>, reactLocalName: string | null): boolean {
  if (!reactLocalName) {
    return false;
  }

  const callee = call.field("function");
  if (!callee || callee.kind() !== "member_expression") {
    return false;
  }

  const object = callee.field("object");
  const property = callee.field("property");
  return object?.kind() === "identifier" &&
    object.text() === reactLocalName &&
    property?.text() === "forwardRef";
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("remove-forward-ref-replacements");

  const forwardRefImport = getImport(rootNode, { type: "named", name: "forwardRef", from: "react" });
  const reactImport = getImport(rootNode, { type: "default", from: "react" });
  let replacements = 0;

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (!isForwardRefIdentifierCall(call, forwardRefImport?.alias ?? null) &&
      !isForwardRefMemberCall(call, reactImport?.alias ?? null)) {
      continue;
    }

    const replacement = buildReplacement(call);
    if (!replacement) {
      continue;
    }

    edits.push(call.replace(replacement));
    replacements++;
  }

  if (replacements === 0) {
    return null;
  }

  if (forwardRefImport) {
    const removeEdit = removeImport(rootNode, {
      type: "named",
      specifiers: ["forwardRef"],
      from: "react",
    });
    if (removeEdit) {
      edits.push(removeEdit);
    }
  }

  metric.increment({ file: metricFile(root.filename()) }, replacements);
  return rootNode.commitEdits(edits);
};

export default transform;
