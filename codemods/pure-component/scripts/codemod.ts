import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

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

function isReactComponentClass(classDecl: SgNode<TSX>): boolean {
  const heritage = classDecl.find({ rule: { kind: "class_heritage" } });
  if (!heritage) {
    return false;
  }

  return heritage.findAll({ rule: { kind: "member_expression" } })
    .some((member) => {
      const object = member.field("object");
      const property = member.field("property");
      return object?.text() === "React" &&
        (property?.text() === "Component" || property?.text() === "PureComponent");
    });
}

function classBodyMembers(classDecl: SgNode<TSX>): SgNode<TSX>[] {
  const body = classDecl.find({ rule: { kind: "class_body" } });
  return namedChildren(body).filter((member) =>
    member.kind() === "method_definition" || member.kind() === "public_field_definition"
  );
}

function memberName(member: SgNode<TSX>): string {
  return member.field("name")?.text() ?? "";
}

function isStaticField(member: SgNode<TSX>): boolean {
  return member.kind() === "public_field_definition" && member.text().startsWith("static ");
}

function isPropsTypeField(member: SgNode<TSX>): boolean {
  return member.kind() === "public_field_definition" &&
    !member.text().startsWith("static ") &&
    memberName(member) === "props";
}

function hasRefAttribute(classDecl: SgNode<TSX>): boolean {
  return classDecl.findAll({
    rule: {
      kind: "jsx_attribute",
    },
  }).some((attr) => namedChildren(attr)[0]?.text() === "ref");
}

function renderMethod(classDecl: SgNode<TSX>): SgNode<TSX> | null {
  return classBodyMembers(classDecl).find((member) =>
    member.kind() === "method_definition" && memberName(member) === "render"
  ) ?? null;
}

function propsTypeAnnotation(classDecl: SgNode<TSX>): string {
  const propsField = classBodyMembers(classDecl).find(isPropsTypeField);
  const annotation = propsField?.find({ rule: { kind: "type_annotation" } });
  return annotation?.text() ?? "";
}

function isThisProps(node: SgNode<TSX>): boolean {
  if (node.kind() !== "member_expression") {
    return false;
  }

  const object = node.field("object");
  const property = node.field("property");
  return object?.kind() === "this" && property?.text() === "props";
}

function propsAccesses(body: SgNode<TSX>): SgNode<TSX>[] {
  return body.findAll({ rule: { kind: "member_expression" } })
    .filter((member) => isThisProps(member.field("object")));
}

function bareThisPropsUses(body: SgNode<TSX>): SgNode<TSX>[] {
  return body.findAll({ rule: { kind: "member_expression" } })
    .filter((member) => {
      if (!isThisProps(member)) {
        return false;
      }

      const parent = member.parent();
      return !(parent?.kind() === "member_expression" && parent.field("object")?.id() === member.id());
    });
}

function safeDuplicateDeclarators(body: SgNode<TSX>): Map<string, SgNode<TSX>> {
  const duplicates = new Map<string, SgNode<TSX>>();

  for (const declarator of body.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name?.kind() !== "identifier" || value?.kind() !== "member_expression") {
      continue;
    }

    const object = value.field("object");
    const property = value.field("property");
    if (!isThisProps(object) || property?.text() !== name.text()) {
      continue;
    }

    duplicates.set(name.text(), declarator);
  }

  return duplicates;
}

function propNames(body: SgNode<TSX>): string[] {
  return Array.from(new Set(
    propsAccesses(body)
      .map((access) => access.field("property")?.text() ?? "")
      .filter((name) => name.length > 0),
  )).sort();
}

function hasDestructureConflicts(body: SgNode<TSX>, names: string[], duplicates: Map<string, SgNode<TSX>>): boolean {
  const propNameSet = new Set(names);
  const safeNames = new Set(duplicates.keys());

  return body.findAll({ rule: { kind: "identifier" } }).some((identifier) => {
    const name = identifier.text();
    if (!propNameSet.has(name) || safeNames.has(name)) {
      return false;
    }

    const parent = identifier.parent();
    if (!parent) {
      return true;
    }

    if (parent.kind() === "member_expression" && parent.field("property")?.id() === identifier.id()) {
      return false;
    }

    const object = parent.kind() === "member_expression" ? parent.field("object") : null;
    if (object && isThisProps(object)) {
      return false;
    }

    return true;
  });
}

function buildParamText(
  names: string[],
  annotation: string,
  destructuring: boolean,
): string {
  if (names.length === 0 && annotation.length === 0) {
    return "";
  }

  if (!destructuring) {
    return `props${annotation}`;
  }

  const pattern = `{ ${names.join(", ")} }`;
  return annotation.length > 0 ? `${pattern}${annotation}` : pattern;
}

function buildStaticAssignments(className: string, classDecl: SgNode<TSX>): string[] {
  return classBodyMembers(classDecl)
    .filter(isStaticField)
    .map((field) => {
      const name = field.field("name")?.text() ?? "";
      const value = field.field("value")?.text() ?? "undefined";
      return `${className}.${name} = ${value};`;
    });
}

function transformBody(
  renderBody: SgNode<TSX>,
  destructure: boolean,
  names: string[],
  duplicates: Map<string, SgNode<TSX>>,
): string {
  const edits: Edit[] = [];

  for (const access of propsAccesses(renderBody)) {
    const propName = access.field("property")?.text();
    if (!propName) {
      continue;
    }

    edits.push(access.replace(destructure ? propName : `props.${propName}`));
  }

  for (const use of bareThisPropsUses(renderBody)) {
    edits.push(use.replace("props"));
  }

  if (destructure) {
    for (const declarator of duplicates.values()) {
      const statement = declarator.ancestors().find((ancestor) =>
        ancestor.kind() === "lexical_declaration" || ancestor.kind() === "variable_declaration"
      );
      if (statement) {
        edits.push({
          startPos: statement.range().start.index,
          endPos: statement.range().end.index,
          insertedText: "",
        });
      }
    }
  }

  return renderBody.commitEdits(edits);
}

function isPureClass(classDecl: SgNode<TSX>): boolean {
  if (!isReactComponentClass(classDecl) || hasRefAttribute(classDecl)) {
    return false;
  }

  const members = classBodyMembers(classDecl);
  const methods = members.filter((member) => member.kind() === "method_definition");
  if (methods.length !== 1 || memberName(methods[0]!) !== "render") {
    return false;
  }

  return members.every((member) => member.kind() === "method_definition" || isStaticField(member) || isPropsTypeField(member));
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("pure-component-conversions");
  const useArrows = options.params?.useArrows === true || options.params?.useArrows === "true";
  const destructuring = options.params?.destructuring === true || options.params?.destructuring === "true";
  let conversions = 0;

  for (const classDecl of rootNode.findAll({ rule: { kind: "class_declaration" } })) {
    if (!isPureClass(classDecl)) {
      continue;
    }

    const className = classDecl.field("name")?.text();
    const render = renderMethod(classDecl);
    const renderBody = render?.field("body");
    if (!className || !renderBody) {
      continue;
    }

    const annotation = propsTypeAnnotation(classDecl);
    const names = propNames(renderBody);
    const duplicates = safeDuplicateDeclarators(renderBody);
    const canDestructure = destructuring &&
      bareThisPropsUses(renderBody).length === 0 &&
      !hasDestructureConflicts(renderBody, names, duplicates);
    const bodyText = transformBody(renderBody, canDestructure, names, duplicates);
    const paramText = buildParamText(names, annotation, canDestructure);
    const staticAssignments = buildStaticAssignments(className, classDecl);

    let replacement = "";
    if (useArrows) {
      replacement = `const ${className} = (${paramText}) => ${bodyText};`;
    } else {
      replacement = `function ${className}(${paramText}) ${bodyText}`;
    }

    if (staticAssignments.length > 0) {
      replacement += `\n\n${staticAssignments.join("\n")}`;
    }

    edits.push({
      startPos: classDecl.range().start.index,
      endPos: classDecl.range().end.index,
      insertedText: replacement,
    });
    conversions++;
  }

  if (edits.length === 0) {
    return null;
  }

  metric.increment({ file: metricFile(root.filename()) }, conversions);
  return rootNode.commitEdits(edits);
};

export default transform;
