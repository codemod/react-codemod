import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

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

function statementRange(node: SgNode<TSX>, source: string): { start: number; end: number } {
  const range = node.range();
  let end = range.end.index;
  while (end < source.length && (source[end] === "\n" || source[end] === "\r")) end++;
  return { start: range.start.index, end };
}

function statementRangeWithLeadingLineComments(
  node: SgNode<TSX>,
  source: string,
): { start: number; end: number } {
  const range = statementRange(node, source);
  let start = range.start;

  while (start > 0) {
    const lineEnd = start;
    let lineStart = source.lastIndexOf("\n", lineEnd - 2);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;
    const line = source.slice(lineStart, lineEnd).trim();
    if (line === "" || line.startsWith("//")) {
      start = lineStart;
      continue;
    }
    break;
  }

  return { start, end: range.end };
}

function removeNodeWithComma(node: SgNode<TSX>, source: string): Edit {
  let start = node.range().start.index;
  let end = node.range().end.index;

  let i = end;
  while (isWhitespace(source[i])) i++;
  if (source[i] === ",") {
    end = i + 1;
    while (isWhitespace(source[end])) end++;
  } else {
    let j = start - 1;
    while (isWhitespace(source[j])) j--;
    if (source[j] === ",") start = j;
  }

  return { startPos: start, endPos: end, insertedText: "" };
}

function nearestStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  return node.ancestors().find((a) =>
    a.kind() === "lexical_declaration" ||
    a.kind() === "variable_declaration" ||
    a.kind() === "import_statement"
  ) ?? null;
}

function isRequireCall(node: SgNode<TSX> | null, moduleNames: Set<string>): boolean {
  if (!node || node.kind() !== "call_expression") return false;
  if (node.field("function")?.text() !== "require") return false;
  const arg = node.field("arguments")?.find({ rule: { kind: "string" } });
  const source = arg ? sourceText(arg) : null;
  return !!source && moduleNames.has(source);
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function hasImportOrRequire(rootNode: SgNode<TSX, "program">, moduleName: string): boolean {
  const modules = new Set([moduleName]);
  return rootNode.findAll({ rule: { kind: "import_statement" } })
    .some((node) => importSource(node) === moduleName) ||
    rootNode.findAll({ rule: { kind: "call_expression" } })
      .some((node) => isRequireCall(node, modules));
}

function usesImportSyntax(rootNode: SgNode<TSX, "program">): boolean {
  return rootNode.findAll({ rule: { kind: "import_statement" } })
    .some((node) => !node.text().startsWith("import type"));
}

function usesVarForRequires(rootNode: SgNode<TSX, "program">): boolean {
  return rootNode.find({ rule: { kind: "lexical_declaration" } }) === null;
}

function firstSortedImportPosition(
  rootNode: SgNode<TSX, "program">,
  moduleName: string,
  source: string,
): number {
  const imports = rootNode.findAll({ rule: { kind: "import_statement" } });
  const lowerModule = moduleName.toLowerCase();
  let target: SgNode<TSX> | null = null;
  let targetName = "";

  for (const imp of imports) {
    const source = importSource(imp);
    if (!source) continue;
    const lowerSource = source.toLowerCase();
    if (lowerSource > lowerModule && (!target || lowerSource < targetName)) {
      target = imp;
      targetName = lowerSource;
    }
  }

  if (target) return target.range().start.index;
  const last = imports[imports.length - 1];
  if (!last) return 0;
  return statementRange(last, source).end;
}

function firstSortedRequirePosition(rootNode: SgNode<TSX, "program">, moduleName: string): number {
  const lowerModule = moduleName.toLowerCase();
  let target: SgNode<TSX> | null = null;
  let targetName = "";

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (call.field("function")?.text() !== "require") continue;
    const arg = call.field("arguments")?.find({ rule: { kind: "string" } });
    const source = arg ? sourceText(arg) : null;
    if (!source) continue;
    const lowerSource = source.toLowerCase();
    if (lowerSource > lowerModule && (!target || lowerSource < targetName)) {
      const stmt = nearestStatement(call);
      if (stmt) {
        target = stmt;
        targetName = lowerSource;
      }
    }
  }

  if (target) return target.range().start.index;
  return 0;
}

function propTypesBindingFromModule(rootNode: SgNode<TSX, "program">, moduleName: string): string | null {
  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(imp) !== moduleName) continue;
    const clause = imp.find({ rule: { kind: "import_clause" } });
    const defaultName = clause?.children().find((c) => c.kind() === "identifier");
    if (defaultName) return defaultName.text();
    const named = imp.findAll({ rule: { kind: "import_specifier" } })
      .find((spec) => spec.field("name")?.text() === "PropTypes");
    if (named && !named.field("alias")) return "PropTypes";
  }

  for (const decl of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const value = decl.field("value");
    if (!isRequireCall(value, new Set([moduleName]))) continue;
    const name = decl.field("name");
    if (name?.kind() === "identifier") return name.text();
  }

  return null;
}

function identifierNamesInPattern(pattern: SgNode<TSX>): string[] {
  return pattern.children()
    .filter((child) =>
      child.kind() === "shorthand_property_identifier_pattern" ||
      child.kind() === "pair_pattern"
    )
    .map((child) => {
      const alias = child.field("value");
      if (alias?.kind() === "identifier") return alias.text();
      return child.field("key")?.text() ?? child.text();
    });
}

function removeNamedImportsAfterDefault(namedImports: SgNode<TSX>, source: string): Edit {
  let start = namedImports.range().start.index;
  let i = start - 1;
  while (isWhitespace(source[i])) i--;
  if (source[i] === ",") start = i;
  return { startPos: start, endPos: namedImports.range().end.index, insertedText: "" };
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("react-proptypes-migrations");
  const moduleName = (options.params?.["module-name"] as string | undefined) ?? "prop-types";
  const reactModules = new Set(["react", "React"]);
  const reactNames = new Set<string>(["React"]);
  let localPropTypesName = propTypesBindingFromModule(rootNode, moduleName) ?? "PropTypes";
  let addedPropTypesImportByReplacement = false;
  let changed = false;

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const sourceName = importSource(imp);
    if (sourceName && reactModules.has(sourceName)) {
      const clause = imp.find({ rule: { kind: "import_clause" } });
      const defaultName = clause?.children().find((c) => c.kind() === "identifier");
      if (defaultName) reactNames.add(defaultName.text());
    }
  }

  for (const decl of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const value = decl.field("value");
    const name = decl.field("name");
    if (name?.kind() === "identifier" && isRequireCall(value, reactModules)) {
      reactNames.add(name.text());
    }
  }

  for (const spec of rootNode.findAll({ rule: { kind: "import_specifier" } })) {
    const parentImport = spec.ancestors().find((a) => a.kind() === "import_statement");
    if (!parentImport || !reactModules.has(importSource(parentImport) ?? "")) continue;
    if (spec.field("name")?.text() !== "PropTypes") continue;
    localPropTypesName = spec.field("alias")?.text() ?? "PropTypes";
    const namedImports = spec.ancestors().find((a) => a.kind() === "named_imports");
    const specifierCount = namedImports?.findAll({ rule: { kind: "import_specifier" } }).length ?? 0;
    const importClause = parentImport.find({ rule: { kind: "import_clause" } });
    const hasDefault = importClause?.children().some((c) => c.kind() === "identifier") ?? false;
    if (specifierCount === 1 && !hasDefault) {
      if (!hasImportOrRequire(rootNode, moduleName)) {
        edits.push(parentImport.replace(`import ${localPropTypesName} from '${moduleName}';`));
        addedPropTypesImportByReplacement = true;
      } else {
        const { start, end } = statementRange(parentImport, source);
        edits.push({ startPos: start, endPos: end, insertedText: "" });
      }
    } else if (specifierCount === 1 && hasDefault && namedImports) {
      edits.push(removeNamedImportsAfterDefault(namedImports, source));
    } else {
      edits.push(removeNodeWithComma(spec, source));
    }
    changed = true;
  }

  for (const pattern of rootNode.findAll({ rule: { kind: "object_pattern" } })) {
    const decl = pattern.ancestors().find((a) => a.kind() === "variable_declarator");
    const statement = decl ? nearestStatement(decl) : null;
    const value = decl?.field("value");
    if (!decl || !statement) continue;
    const destructuresReact =
      (value?.kind() === "identifier" && reactNames.has(value.text())) ||
      isRequireCall(value ?? null, reactModules);
    if (!destructuresReact) continue;

    const props = pattern.children().filter((child) =>
      child.kind() === "shorthand_property_identifier_pattern" ||
      child.kind() === "pair_pattern"
    );
    const propTypesProp = props.find((prop) =>
      prop.text() === "PropTypes" || prop.field("key")?.text() === "PropTypes"
    );
    if (!propTypesProp) continue;

    const nestedPattern = propTypesProp.field("value");
    if (nestedPattern?.kind() === "object_pattern") {
      const childNames = identifierNamesInPattern(nestedPattern);
      if (childNames.length > 0) {
        edits.push({
          startPos: statement.range().start.index,
          endPos: statement.range().start.index,
          insertedText: `const { ${childNames.join(", ")} } = ${localPropTypesName};\n`,
        });
      }
    } else {
      const alias = propTypesProp.field("value");
      if (alias?.kind() === "identifier") localPropTypesName = alias.text();
    }

    if (props.length === 1) {
      const { start, end } = statementRange(statement, source);
      edits.push({ startPos: start, endPos: end, insertedText: "" });
    } else {
      edits.push(removeNodeWithComma(propTypesProp, source));
    }
    changed = true;
  }

  for (const member of rootNode.findAll({ rule: { kind: "member_expression" } })) {
    const object = member.field("object");
    const property = member.field("property");
    if (!object || !property || property.text() !== "PropTypes") continue;
    if (object.kind() !== "identifier" || !reactNames.has(object.text())) continue;

    const declarator = member.ancestors().find((a) => a.kind() === "variable_declarator");
    const name = declarator?.field("name");
    if (declarator && name?.kind() === "identifier" && name.text() === localPropTypesName) {
      const statement = nearestStatement(declarator);
      if (statement) {
        const { start, end } = statementRangeWithLeadingLineComments(statement, source);
        edits.push({ startPos: start, endPos: end, insertedText: "" });
      }
    } else {
      edits.push(member.replace(localPropTypesName));
    }
    changed = true;
    metric.increment({ file: metricFile(root.filename()) });
  }

  if (!changed) return null;

  if (!addedPropTypesImportByReplacement && !hasImportOrRequire(rootNode, moduleName)) {
    if (usesImportSyntax(rootNode)) {
      const pos = firstSortedImportPosition(rootNode, moduleName, source);
      edits.push({
        startPos: pos,
        endPos: pos,
        insertedText: `import ${localPropTypesName} from '${moduleName}';\n`,

      });
    } else {
      const pos = firstSortedRequirePosition(rootNode, moduleName);
      const keyword = usesVarForRequires(rootNode) ? "var" : "const";
      edits.push({
        startPos: pos,
        endPos: pos,
        insertedText: `${keyword} ${localPropTypesName} = require('${moduleName}');\n`,
      });
    }
  }

  return rootNode.commitEdits(edits);
};

export default transform;
