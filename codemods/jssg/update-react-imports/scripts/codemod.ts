import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

type Specifier = { name: string; alias?: string; isType: boolean };

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  if (text.length >= 2) return text.slice(1, -1);
  return null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function isReactImport(node: SgNode<TSX>): boolean {
  const source = importSource(node);
  return source === "react" || source === "React";
}

function statementRange(node: SgNode<TSX>, source: string): { start: number; end: number } {
  const range = node.range();
  let end = range.end.index;
  while (end < source.length && (source[end] === "\n" || source[end] === "\r")) end++;
  return { start: range.start.index, end };
}

function formatSpec(spec: Specifier): string {
  const name = spec.alias && spec.alias !== spec.name ? `${spec.name} as ${spec.alias}` : spec.name;
  return spec.isType ? `type ${name}` : name;
}

function uniqueSpecs(specs: Specifier[]): Specifier[] {
  const seen = new Set<string>();
  const result: Specifier[] = [];
  for (const spec of specs) {
    const key = `${spec.isType}:${spec.name}:${spec.alias ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(spec);
    }
  }
  return result;
}

function splitSpecs(specs: Specifier[]): { regular: Specifier[]; type: Specifier[] } {
  return {
    regular: uniqueSpecs(specs.filter((s) => !s.isType)),
    type: uniqueSpecs(specs.filter((s) => s.isType).map((s) => ({ ...s, isType: false }))),
  };
}

function importText(specs: Specifier[], quote: string, typeOnly = false): string | null {
  if (specs.length === 0) return null;
  const body = specs.map(formatSpec).join(", ");
  return typeOnly
    ? `import type { ${body} } from ${quote}react${quote};\n`
    : `import { ${body} } from ${quote}react${quote};\n`;
}

function namespaceImportText(quote: string): string {
  return `import * as React from ${quote}react${quote};\n`;
}

function quoteFor(node: SgNode<TSX>): string {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  const text = source?.text() ?? "\"react\"";
  return text.startsWith("'") ? "'" : "\"";
}

function getReactSpecifier(importNode: SgNode<TSX>): "default" | "namespace" | null {
  const clause = importNode.find({ rule: { kind: "import_clause" } });
  if (!clause) return null;
  const namespace = clause.find({ rule: { kind: "namespace_import" } });
  if (namespace?.find({ rule: { kind: "identifier", regex: "^React$" } })) return "namespace";
  const firstIdentifier = clause.children().find((c) => c.kind() === "identifier");
  return firstIdentifier?.text() === "React" ? "default" : null;
}

function namedSpecifiers(importNode: SgNode<TSX>): Specifier[] {
  return importNode.findAll({ rule: { kind: "import_specifier" } })
    .map((spec) => ({
      name: spec.field("name")?.text() ?? spec.text(),
      alias: spec.field("alias")?.text() ?? undefined,
      isType: spec.text().startsWith("type ") || importNode.text().startsWith("import type"),
    }));
}

function identifierIsInImport(node: SgNode<TSX>): boolean {
  return node.ancestors().some((a) => a.kind() === "import_statement");
}

function parentUsesIdentifierAsObject(node: SgNode<TSX>): SgNode<TSX> | null {
  const parent = node.parent();
  if (!parent) return null;
  if (
    parent.kind() === "member_expression" &&
    parent.field("object")?.id() === node.id() &&
    parent.field("property")
  ) {
    return parent;
  }
  return null;
}

function isDeclared(rootNode: SgNode<TSX, "program">, name: string): boolean {
  return rootNode.findAll({ rule: { kind: "identifier", regex: `^${name}$` } })
    .some((node) => {
      if (identifierIsInImport(node)) return false;
      const parent = node.parent();
      if (!parent) return true;
      if (parent.kind() === "member_expression" && parent.field("object")?.id() === node.id()) {
        return false;
      }
      if (parent.kind() === "nested_type_identifier" && parent.field("object")?.id() === node.id()) {
        return false;
      }
      return true;
    });
}

function removeReactImportEdits(imports: SgNode<TSX>[], source: string): Edit[] {
  return imports.map((imp) => {
    const { start, end } = statementRange(imp, source);
    return { startPos: start, endPos: end, insertedText: "" };
  });
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const metric = useMetricAtom("react-import-updates");
  const edits: Edit[] = [];

  const reactImports = rootNode.findAll({ rule: { kind: "import_statement" } }).filter(isReactImport);
  const valueReactImports = reactImports.filter((imp) =>
    !imp.text().startsWith("import type") && getReactSpecifier(imp) !== null

  );
  if (valueReactImports.length === 0) return null;

  const primaryReactImport = valueReactImports[0]!;
  const reactSpecifierKind = getReactSpecifier(primaryReactImport)!;
  const quote = quoteFor(primaryReactImport);
  const allNamedFromReactImports = reactImports.flatMap(namedSpecifiers);
  const allExistingNamed = valueReactImports.flatMap(namedSpecifiers);
  const reactIdentifiers = rootNode.findAll({ rule: { kind: "identifier", regex: "^React$" } })
    .filter((node) => !identifierIsInImport(node));

  const memberUsages: SgNode<TSX>[] = [];
  let hasDirectReactUse = false;
  let hasTypeNamespaceUse = false;

  for (const identifier of reactIdentifiers) {
    const member = parentUsesIdentifierAsObject(identifier);
    if (member) {
      memberUsages.push(member);
      continue;
    }
    const parent = identifier.parent();
    if (parent?.kind() === "nested_type_identifier" && parent.field("object")?.id() === identifier.id()) {
      hasTypeNamespaceUse = true;
      continue;
    }
    hasDirectReactUse = true;
  }

  const isReactUsed = reactIdentifiers.length > 0 || hasTypeNamespaceUse;
  const canDestructure = isReactUsed && !hasDirectReactUse && !hasTypeNamespaceUse;
  const regularSpecs: Specifier[] = [];
  const typeSpecs: Specifier[] = [];
  const memberReplacementEdits: Edit[] = [];
  const existingRegularNames = new Set(
    allNamedFromReactImports
      .filter((spec) => !spec.isType)
      .flatMap((spec) => [spec.name, spec.alias].filter(Boolean) as string[]),
  );

  if (canDestructure) {
    for (const member of memberUsages) {
      const property = member.field("property");
      if (!property) continue;
      const name = property.text();
      if (existingRegularNames.has(name) || isDeclared(rootNode, name)) {
        hasDirectReactUse = true;
        break;
      }
      regularSpecs.push({ name, isType: false });
      memberReplacementEdits.push(member.replace(name));
    }
  }

  const shouldDestructure =
    (reactSpecifierKind === "default" ||
      options.params?.destructureNamespaceImports === "true") &&
    canDestructure &&
    !hasDirectReactUse;
  const splitExisting = splitSpecs(allExistingNamed);
  regularSpecs.push(...splitExisting.regular);
  typeSpecs.push(...splitExisting.type);

  let replacementImports = "";
  if (shouldDestructure) {
    edits.push(...memberReplacementEdits);
    replacementImports += importText(uniqueSpecs(typeSpecs), quote, true) ?? "";
    replacementImports += importText(uniqueSpecs(regularSpecs), quote) ?? "";
  } else {
    const split = splitSpecs(allExistingNamed);
    replacementImports += importText(split.type, quote, true) ?? "";
    replacementImports += importText(split.regular, quote) ?? "";
    if (isReactUsed) {
      replacementImports += namespaceImportText(quote);
    }
  }

  const firstImport = valueReactImports[0]!;
  edits.push({
    startPos: firstImport.range().start.index,
    endPos: firstImport.range().start.index,
    insertedText: replacementImports,
  });
  edits.push(...removeReactImportEdits(valueReactImports, source));

  metric.increment({
    action: shouldDestructure
      ? "convert-member-to-named"
      : isReactUsed
        ? "convert-to-namespace"
        : "remove-react-import",
    file: metricFile(root.filename()),
    previous: reactSpecifierKind,
  });

  return rootNode.commitEdits(edits);
};

export default transform;
