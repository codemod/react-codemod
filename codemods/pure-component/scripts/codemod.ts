import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

type ReactImportAliases = {
  component: Set<string>;
  pureComponent: Set<string>;
  removableNamed: Set<string>;
};

type ReactSuperclassKind = "Component" | "PureComponent";

const REACT_SOURCES = new Set(["react", "React", "react/addons", "react-native"]);

function truthyParam(value: unknown): boolean {
  return value === true || value === "true";
}

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function namedChildren(node: SgNode<TSX> | null): SgNode<TSX>[] {
  if (!node) return [];
  return node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function importSource(importStmt: SgNode<TSX>): SgNode<TSX> | null {
  return importStmt.field("source") ?? importStmt.find({ rule: { kind: "string" } });
}

function isReactSource(importStmt: SgNode<TSX>): boolean {
  const source = importSource(importStmt);
  const value = source ? sourceText(source) : null;
  return value !== null && REACT_SOURCES.has(value);
}

function reactImportAliases(rootNode: SgNode<TSX>): ReactImportAliases {
  const component = new Set<string>();
  const pureComponent = new Set<string>();
  const removableNamed = new Set<string>();

  for (const importStmt of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (!isReactSource(importStmt)) continue;

    for (const specifier of importStmt.findAll({ rule: { kind: "import_specifier" } })) {
      const imported = specifier.field("name")?.text();
      const aliasNode = specifier.field("alias");
      const alias = aliasNode?.text() ?? imported;
      if (!imported || !alias) continue;

      if (imported === "Component") {
        component.add(alias);
      } else if (imported === "PureComponent") {
        pureComponent.add(alias);
      } else {
        continue;
      }

      // Legacy removes an import specifier by searching for its `imported` name
      // in the rest of the file. For `{ Component as C }`, imported=Component but
      // the class extends `C`; the search finds no `Component` identifier and the
      // specifier gets kept (legacy quirk). Mirror that: only flag as removable
      // when the local name equals the imported name.
      if (!aliasNode) removableNamed.add(alias);
    }
  }

  return { component, pureComponent, removableNamed };
}

function reactSuperclassKind(
  classDecl: SgNode<TSX>,
  aliases: ReactImportAliases,
): ReactSuperclassKind | null {
  const heritage = classDecl.find({ rule: { kind: "class_heritage" } });
  if (!heritage) return null;

  const directExtends = heritage.find({
    rule: { any: [{ kind: "member_expression" }, { kind: "identifier" }] },
  });
  if (!directExtends) return null;

  if (directExtends.kind() === "member_expression") {
    const object = directExtends.field("object");
    const property = directExtends.field("property")?.text() ?? "";
    if (object?.text() !== "React") return null;
    if (property === "Component" || property === "PureComponent") return property;
    return null;
  }

  const name = directExtends.text();
  if (aliases.component.has(name)) return "Component";
  if (aliases.pureComponent.has(name)) return "PureComponent";
  return null;
}

function classBodyMembers(classDecl: SgNode<TSX>): SgNode<TSX>[] {
  const body = classDecl.find({ rule: { kind: "class_body" } });
  return namedChildren(body).filter(
    (m) => m.kind() === "method_definition" || m.kind() === "public_field_definition",
  );
}

function memberName(member: SgNode<TSX>): string {
  return member.field("name")?.text() ?? "";
}

function isRenderMethod(member: SgNode<TSX>): boolean {
  return member.kind() === "method_definition" && memberName(member) === "render";
}

function isStaticField(member: SgNode<TSX>): boolean {
  if (member.kind() !== "public_field_definition") return false;
  return member.children().some((child) => child.kind() === "static" || child.text() === "static");
}

function isPropsTypeField(member: SgNode<TSX>): boolean {
  return member.kind() === "public_field_definition" &&
    !isStaticField(member) &&
    memberName(member) === "props";
}

function onlyHasSafeMembers(classDecl: SgNode<TSX>): boolean {
  const members = classBodyMembers(classDecl);
  const methods = members.filter((m) => m.kind() === "method_definition");
  if (methods.length !== 1 || !isRenderMethod(methods[0]!)) return false;
  return members.every((m) => isRenderMethod(m) || isPropsTypeField(m) || isStaticField(m));
}

function hasRefAttribute(classDecl: SgNode<TSX>): boolean {
  return classDecl.findAll({ rule: { kind: "jsx_attribute" } })
    .some((attr) => namedChildren(attr)[0]?.text() === "ref");
}

function renderMethod(classDecl: SgNode<TSX>): SgNode<TSX> | null {
  return classBodyMembers(classDecl).find(isRenderMethod) ?? null;
}

function propsField(classDecl: SgNode<TSX>): SgNode<TSX> | null {
  return classBodyMembers(classDecl).find(isPropsTypeField) ?? null;
}

function propsTypeAnnotationText(classDecl: SgNode<TSX>): string {
  const annotation = propsField(classDecl)?.find({ rule: { kind: "type_annotation" } });
  return annotation?.text() ?? "";
}

function propsObjectType(classDecl: SgNode<TSX>): SgNode<TSX> | null {
  const annotation = propsField(classDecl)?.find({ rule: { kind: "type_annotation" } });
  const typeNode = namedChildren(annotation)[0] ?? null;
  return typeNode?.kind() === "object_type" ? typeNode : null;
}

function isThisProps(node: SgNode<TSX> | null | undefined): boolean {
  if (!node || node.kind() !== "member_expression") return false;
  const object = node.field("object");
  const property = node.field("property");
  return object?.kind() === "this" && property?.text() === "props";
}

function thisPropsExpressions(body: SgNode<TSX>): SgNode<TSX>[] {
  return body.findAll({ rule: { kind: "member_expression" } }).filter(isThisProps);
}

function propsAccesses(body: SgNode<TSX>): SgNode<TSX>[] {
  return body.findAll({ rule: { kind: "member_expression" } })
    .filter((m) => isThisProps(m.field("object")));
}

function barePropsIdentifiers(methodDef: SgNode<TSX>): boolean {
  return methodDef.findAll({
    rule: {
      any: [
        { kind: "identifier", regex: "^props$" },
        { kind: "property_identifier", regex: "^props$" },
      ],
    },
  }).some((identifier) => {
    const parent = identifier.parent();
    const grand = parent?.parent();
    if (
      parent?.kind() === "member_expression" &&
      grand?.kind() === "member_expression" &&
      grand.field("object")?.id() === parent.id()
    ) {
      return false;
    }
    return true;
  });
}

function duplicateDeclarators(body: SgNode<TSX>): Map<string, SgNode<TSX>> {
  const duplicates = new Map<string, SgNode<TSX>>();
  for (const declarator of body.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name?.kind() !== "identifier" || value?.kind() !== "member_expression") continue;
    const object = value.field("object");
    const property = value.field("property");
    if (!object || !property || !isThisProps(object) || property.text() !== name.text()) continue;
    duplicates.set(name.text(), declarator);
  }
  return duplicates;
}

function propNamesInOrder(body: SgNode<TSX>): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const access of propsAccesses(body)) {
    const property = access.field("property")?.text();
    if (property && !seen.has(property)) {
      seen.add(property);
      names.push(property);
    }
  }
  return names;
}

function hasAssignmentNamesShadowing(
  body: SgNode<TSX>,
  propNames: string[],
  duplicates: Map<string, SgNode<TSX>>,
): boolean {
  const propNameSet = new Set(propNames);
  const duplicateNames = new Set(duplicates.keys());

  return body.findAll({ rule: { kind: "identifier" } }).some((identifier) => {
    const name = identifier.text();
    if (!propNameSet.has(name) || duplicateNames.has(name)) return false;
    const parent = identifier.parent();
    if (!parent) return true;
    if (parent.kind() === "member_expression" && parent.field("property")?.id() === identifier.id()) {
      return false;
    }
    const object = parent.kind() === "member_expression" ? parent.field("object") : null;
    if (object && isThisProps(object)) return false;
    return true;
  });
}

function canDestructure(
  classDecl: SgNode<TSX>,
  methodDef: SgNode<TSX>,
  body: SgNode<TSX>,
): boolean {
  const names = propNamesInOrder(body);
  const duplicates = duplicateDeclarators(body);
  if (barePropsIdentifiers(methodDef) || hasAssignmentNamesShadowing(body, names, duplicates)) {
    return false;
  }
  // Without an inline object type we can't produce a typed destructure pattern.
  // The legacy transform crashes in this case (calls `.properties.forEach` on a
  // non-object type); we skip safely and fall back to `props: Annotation`.
  const annotationText = propsTypeAnnotationText(classDecl);
  if (annotationText === "") return true;
  return propsObjectType(classDecl) !== null;
}

function lineDeletionRange(
  node: SgNode<TSX>,
  source: string,
): { start: number; end: number } {
  const range = node.range();
  let start = range.start.index;
  while (start > 0 && source[start - 1] !== "\n") start--;
  let end = range.end.index;
  if (end < source.length && source[end] === "\n") end++;
  return { start, end };
}

function rangeContains(
  outer: { start: number; end: number },
  inner: { start: number; end: number },
): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

function rewriteRenderBody(
  renderBody: SgNode<TSX>,
  source: string,
  mayDestructure: boolean,
  duplicates: Map<string, SgNode<TSX>>,
): string {
  const edits: Edit[] = [];
  const deletedRanges: Array<{ start: number; end: number }> = [];

  if (mayDestructure) {
    for (const declarator of duplicates.values()) {
      const stmt = declarator.parent();
      if (!stmt) continue;
      if (stmt.kind() !== "lexical_declaration" && stmt.kind() !== "variable_declaration") continue;
      const declarators = stmt.findAll({ rule: { kind: "variable_declarator" } });
      if (declarators.length !== 1) continue;
      const range = lineDeletionRange(stmt, source);
      deletedRanges.push(range);
      edits.push({ startPos: range.start, endPos: range.end, insertedText: "" });
    }
  }

  const inDeleted = (node: SgNode<TSX>) => {
    const r = node.range();
    const span = { start: r.start.index, end: r.end.index };
    return deletedRanges.some((dr) => rangeContains(dr, span));
  };

  if (mayDestructure) {
    for (const access of propsAccesses(renderBody)) {
      if (inDeleted(access)) continue;
      const prop = access.field("property")?.text();
      if (prop) edits.push(access.replace(prop));
    }
  } else {
    for (const me of thisPropsExpressions(renderBody)) {
      edits.push(me.replace("props"));
    }
  }

  return renderBody.commitEdits(edits);
}

function normalizeBlock(blockText: string, indent: string): string {
  const lines = blockText.split("\n");
  if (lines.length <= 2) return blockText;

  const inner = lines.slice(1, -1);
  const nonEmpty = inner.filter((line) => line.trim().length > 0);
  const commonIndent = nonEmpty.length === 0
    ? 0
    : Math.min(...nonEmpty.map((line) => line.match(/^ */)?.[0].length ?? 0));
  const body = inner
    .map((line) => (line.length >= commonIndent ? line.slice(commonIndent) : line))
    .map((line) => (line.trim().length > 0 ? `${indent}${line}` : ""))
    .join("\n");
  return `{\n${body}\n}`;
}

function renderDestructuredParam(names: string[], objectType: SgNode<TSX> | null): string {
  const typed = new Map<string, string>();
  if (objectType) {
    for (const prop of objectType.findAll({ rule: { kind: "property_signature" } })) {
      const key = prop.field("name")?.text();
      const type = prop.find({ rule: { kind: "type_annotation" } })?.text().replace(/^:\s*/, "");
      if (key && type) typed.set(key, type);
    }
  }

  const lines = names.map((name) =>
    typed.has(name) ? `    ${name}: ${typed.get(name)},` : `    ${name},`,
  );
  return `(\n  {\n${lines.join("\n")}\n  },\n)`;
}

function renderFunctionLike(
  name: string,
  bodyText: string,
  paramText: string,
  useArrows: boolean,
): string {
  const body = normalizeBlock(bodyText, "  ");

  if (useArrows) {
    let left: string;
    if (paramText === "") left = "()";
    else if (paramText === "props") left = "props";
    else if (paramText.startsWith("(")) left = paramText;
    else left = `(${paramText})`;
    return `const ${name} = ${left} => ${body};`;
  }

  if (paramText.startsWith("(")) {
    return `function ${name}${paramText} ${body}`;
  }
  return `function ${name}(${paramText}) ${body}`;
}

function renderStaticAssignments(className: string, classDecl: SgNode<TSX>): string[] {
  return classBodyMembers(classDecl)
    .filter(isStaticField)
    .map((field) => {
      const name = field.field("name")?.text() ?? "";
      const value = field.field("value")?.text() ?? "undefined";
      return `${className}.${name} = ${value};`;
    });
}

function getClassName(classDecl: SgNode<TSX>): string | null {
  return classDecl.field("name")?.text() ?? null;
}

function skipWarning(classDecl: SgNode<TSX>): string {
  const name = getClassName(classDecl) ?? "Unknown";
  const filename = classDecl.getRoot().filename();
  const { line, column } = classDecl.range().start;
  // Jscodeshift reports line as 1-indexed, column as 0-indexed. Ast-grep is
  // 0-indexed on both; +1 on the line matches legacy output exactly.
  return `Class "${name}" skipped in ${filename} on ${line + 1}:${column}`;
}

function enclosingExportStatement(classDecl: SgNode<TSX>): SgNode<TSX> | null {
  const parent = classDecl.parent();
  return parent?.kind() === "export_statement" ? parent : null;
}

function isDefaultExportStatement(exportStmt: SgNode<TSX>): boolean {
  return exportStmt.children().some((c) => c.kind() === "default" || c.text() === "default");
}

function remainingNamedImportUse(
  rootNode: SgNode<TSX>,
  alias: string,
  transformedClassIds: Set<number>,
): boolean {
  return rootNode
    .findAll({ rule: { kind: "identifier", regex: `^${alias}$` } })
    .some((identifier) => {
      if (identifier.ancestors().some((a) => a.kind() === "import_statement")) return false;
      const classDecl = identifier.ancestors().find((a) => a.kind() === "class_declaration");
      if (!classDecl) return true;
      return !transformedClassIds.has(classDecl.id());
    });
}

function buildImportSpecifierEdits(
  importStmt: SgNode<TSX>,
  aliasesToDrop: Set<string>,
  source: string,
): Edit[] {
  const named = importStmt.find({ rule: { kind: "named_imports" } });
  if (!named) return [];

  const specifiers = named.findAll({ rule: { kind: "import_specifier" } });
  const toKeep = specifiers.filter((s) => {
    const local = s.field("alias")?.text() ?? s.field("name")?.text() ?? "";
    return !aliasesToDrop.has(local);
  });

  if (toKeep.length === specifiers.length) return [];

  const clause = importStmt.find({ rule: { kind: "import_clause" } });
  const defaultImport = clause
    ? namedChildren(clause).find((c) => c.kind() === "identifier")
    : null;

  if (toKeep.length === 0) {
    if (defaultImport) {
      return [{
        startPos: clause!.range().start.index,
        endPos: clause!.range().end.index,
        insertedText: defaultImport.text(),
      }];
    }
    // Legacy uses ImportSpecifier.remove() which drops only the specifier and
    // leaves `import 'source';` as a side-effect import. Match that by
    // replacing the import_clause (plus the trailing `from`) with nothing.
    const sourceNode = importSource(importStmt);
    if (!clause || !sourceNode) {
      const range = lineDeletionRange(importStmt, source);
      return [{ startPos: range.start, endPos: range.end, insertedText: "" }];
    }
    return [{
      startPos: clause.range().start.index,
      endPos: sourceNode.range().start.index,
      insertedText: "",
    }];
  }

  const newSpecifiers = toKeep.map((s) => s.text()).join(", ");
  return [{
    startPos: named.range().start.index,
    endPos: named.range().end.index,
    insertedText: `{ ${newSpecifiers} }`,
  }];
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const metric = useMetricAtom("pure-component-conversions");
  const useArrows = truthyParam(options.params?.useArrows);
  const destructuring = truthyParam(options.params?.destructuring);
  const silenceWarnings = truthyParam(options.params?.silenceWarnings);

  const aliases = reactImportAliases(rootNode);
  const edits: Edit[] = [];
  const transformedClassIds = new Set<number>();
  const reactClasses = rootNode.findAll({ rule: { kind: "class_declaration" } })
    .map((classDecl) => ({ classDecl, kind: reactSuperclassKind(classDecl, aliases) }))
    .filter((entry): entry is { classDecl: SgNode<TSX>; kind: ReactSuperclassKind } => entry.kind !== null);
  const targetSuperclassKind = reactClasses.some((entry) => entry.kind === "Component")
    ? "Component"
    : reactClasses.some((entry) => entry.kind === "PureComponent")
      ? "PureComponent"
      : null;

  for (const { classDecl, kind } of reactClasses) {
    if (targetSuperclassKind === null || kind !== targetSuperclassKind) continue;

    if (!onlyHasSafeMembers(classDecl) || hasRefAttribute(classDecl)) {
      if (!silenceWarnings) console.warn(skipWarning(classDecl));
      continue;
    }

    const name = getClassName(classDecl);
    const render = renderMethod(classDecl);
    const renderBody = render?.field("body");
    if (!name || !render || !renderBody) continue;

    const names = propNamesInOrder(renderBody);
    const duplicates = duplicateDeclarators(renderBody);
    const objectType = propsObjectType(classDecl);
    const annotationText = propsTypeAnnotationText(classDecl);
    const hasPropsUse = thisPropsExpressions(renderBody).length > 0;
    const canDestr = canDestructure(classDecl, render, renderBody);
    const mayDestructure = destructuring && hasPropsUse && canDestr;

    if (destructuring && !canDestr) {
      console.warn(`Unable to destructure ${name} props.`);
    }

    const newBodyText = rewriteRenderBody(renderBody, source, mayDestructure, duplicates);

    let paramText = "";
    if (hasPropsUse) {
      if (mayDestructure) {
        paramText = renderDestructuredParam(names, objectType);
      } else {
        paramText = annotationText ? `props${annotationText}` : "props";
      }
    }

    let replacement = renderFunctionLike(name, newBodyText, paramText, useArrows);
    const statics = renderStaticAssignments(name, classDecl);
    if (statics.length > 0) replacement += `\n\n${statics.join("\n")}`;

    const exportStmt = enclosingExportStatement(classDecl);
    const isDefault = exportStmt ? isDefaultExportStatement(exportStmt) : false;
    const splitDefault = isDefault && useArrows;

    let editStart: number;
    let editEnd: number;
    if (splitDefault) {
      editStart = exportStmt!.range().start.index;
      editEnd = exportStmt!.range().end.index;
      replacement = `${replacement}\nexport default ${name};`;
    } else {
      editStart = classDecl.range().start.index;
      editEnd = classDecl.range().end.index;
    }

    edits.push({ startPos: editStart, endPos: editEnd, insertedText: replacement });
    transformedClassIds.add(classDecl.id());
  }

  if (edits.length === 0) return null;

  const aliasesToDrop = new Set<string>();
  for (const alias of aliases.removableNamed) {
    if (!remainingNamedImportUse(rootNode, alias, transformedClassIds)) {
      aliasesToDrop.add(alias);
    }
  }

  if (aliasesToDrop.size > 0) {
    for (const importStmt of rootNode.findAll({ rule: { kind: "import_statement" } })) {
      if (!isReactSource(importStmt)) continue;
      edits.push(...buildImportSpecifierEdits(importStmt, aliasesToDrop, source));
    }
  }

  metric.increment({ file: metricFile(root.filename()) }, transformedClassIds.size);
  return rootNode.commitEdits(edits);
};

export default transform;
