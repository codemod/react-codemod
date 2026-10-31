import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { addImport, getImport, removeImport } from "@jssg/utils/javascript/imports";

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

function hasPropTypesModule(
  rootNode: SgNode<TSX, "program">,
  moduleName: string,
): boolean {
  return (
    getImport(rootNode, { type: "default", from: moduleName }) !== null ||
    getImport(rootNode, { type: "named", name: "PropTypes", from: moduleName }) !== null
  );
}

function dominantQuote(rootNode: SgNode<TSX, "program">): "'" | '"' {
  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = imp.field("source");
    if (source?.text().startsWith("'")) return "'";
    if (source?.text().startsWith('"')) return '"';
  }

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (call.field("function")?.text() !== "require") continue;
    const arg = call.field("arguments")?.find({ rule: { kind: "string" } });
    if (arg?.text().startsWith("'")) return "'";
    if (arg?.text().startsWith('"')) return '"';
  }

  return "'";
}

function withQuoteStyle(edit: Edit, quote: "'" | '"'): Edit {
  if (quote === "'") return edit;
  return {
    ...edit,
    insertedText: edit.insertedText
      .replace(/\bfrom '([^']*)'/g, `from "$1"`)
      .replace(/\brequire\('([^']*)'\)/g, `require("$1")`),
  };
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

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("react-proptypes-migrations");
  const moduleName = (options.params?.["module-name"] as string | undefined) ?? "prop-types";
  const reactModules = ["react", "React"] as const;
  const reactNames = new Set<string>();
  let localPropTypesName =
    getImport(rootNode, { type: "default", from: moduleName })?.alias ?? "PropTypes";
  let changed = false;

  const usesEsmImports = rootNode.findAll({ rule: { kind: "import_statement" } })
    .some((node) => !node.text().startsWith("import type"));
  let moduleType: "esm" | "cjs" = usesEsmImports ? "esm" : "cjs";

  for (const from of reactModules) {
    const defaultImp = getImport(rootNode, { type: "default", from });
    if (defaultImp) {
      reactNames.add(defaultImp.alias);
      if (!usesEsmImports) {
        moduleType = defaultImp.moduleType;
      }
    }
  }

  if (reactNames.size === 0) {
    reactNames.add("React");
  }

  for (const from of reactModules) {
    const propTypesImport = getImport(rootNode, { type: "named", name: "PropTypes", from });
    if (!propTypesImport || propTypesImport.isNamespace) continue;

    localPropTypesName = propTypesImport.alias;

    const removeEdit = removeImport(rootNode, {
      type: "named",
      specifiers: ["PropTypes"],
      from,
    });
    if (removeEdit) {
      edits.push(removeEdit);
      changed = true;
    }
  }

  for (const pattern of rootNode.findAll({ rule: { kind: "object_pattern" } })) {
    const decl = pattern.ancestors().find((a) => a.kind() === "variable_declarator");
    const statement = decl ? nearestStatement(decl) : null;
    const value = decl?.field("value");
    if (!decl || !statement) continue;
    const destructuresReact =
      (value?.kind() === "identifier" && reactNames.has(value.text())) ||
      isRequireCall(value ?? null, new Set(reactModules));
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

  if (!hasPropTypesModule(rootNode, moduleName)) {
    const quote = dominantQuote(rootNode);
    const addEdit = addImport(rootNode, {
      type: "default",
      name: localPropTypesName,
      from: moduleName,
      moduleType,
    });
    if (addEdit) {
      let edit = withQuoteStyle(addEdit, quote);
      // Removals that consume blank lines after the last import can overlap
      // addImport's insertion point; relocate to file start in that case.
      const conflicts = edits.some((e) =>
        e.insertedText === "" &&
        e.startPos <= edit.startPos &&
        edit.startPos < e.endPos
      );
      if (conflicts) {
        edit = { ...edit, startPos: 0, endPos: 0 };
      }
      edits.push(edit);
    }
  }

  return rootNode.commitEdits(edits);
};

export default transform;
