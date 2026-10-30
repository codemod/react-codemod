import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { addImport, getAllImports } from "@jssg/utils/javascript/imports";

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

type ReactImportInfo = {
  componentNames: Set<string>;
  reactObjectNames: Set<string>;
  preferredReactObjectName: string | null;
};

function collectReactImportInfo(rootNode: SgNode<TSX, "program">): ReactImportInfo {
  const componentNames = new Set<string>();
  const reactObjectNames = new Set<string>();
  let preferredReactObjectName: string | null = null;

  for (const imp of getAllImports(rootNode, { type: "default", from: "react" })) {
    reactObjectNames.add(imp.alias);
    preferredReactObjectName ??= imp.alias;
  }

  for (const name of ["Component", "PureComponent"] as const) {
    for (const imp of getAllImports(rootNode, { type: "named", name, from: "react" })) {
      if (!imp.isNamespace) {
        componentNames.add(imp.alias);
      }
    }
  }

  return {
    componentNames,
    reactObjectNames,
    preferredReactObjectName,
  };
}

function collectUsedIdentifiers(rootNode: SgNode<TSX, "program">): Set<string> {
  const identifiers = new Set<string>();

  for (const kind of ["identifier", "type_identifier"] as const) {
    for (const node of rootNode.findAll({ rule: { kind } })) {
      identifiers.add(node.text());
    }
  }

  return identifiers;
}

function uniqueIdentifier(base: string, usedIdentifiers: Set<string>): string {
  if (!usedIdentifiers.has(base)) {
    usedIdentifiers.add(base);
    return base;
  }

  let suffix = 2;
  while (usedIdentifiers.has(`${base}${suffix}`)) {
    suffix++;
  }

  const name = `${base}${suffix}`;
  usedIdentifiers.add(name);
  return name;
}

function classBodyNode(classNode: SgNode<TSX>): SgNode<TSX> | null {
  return classNode.field("body") ?? classNode.children().find((child) => child.kind() === "class_body") ?? null;
}

function classHeritageText(classNode: SgNode<TSX>): string | null {
  const heritage = classNode.children().find((child) => child.kind() === "class_heritage");
  if (!heritage) {
    return null;
  }

  return heritage.text().replace(/^extends\s+/, "").trim();
}

function normalizeSuperclassText(text: string): string {
  return text.replace(/<[\s\S]*$/, "").trim();
}

function isReactClassComponent(classNode: SgNode<TSX>, reactImportInfo: ReactImportInfo): boolean {
  const heritage = classHeritageText(classNode);
  if (!heritage) {
    return false;
  }

  const superclass = normalizeSuperclassText(heritage);
  if (reactImportInfo.componentNames.has(superclass)) {
    return true;
  }

  for (const reactObjectName of reactImportInfo.reactObjectNames) {
    if (superclass === `${reactObjectName}.Component` || superclass === `${reactObjectName}.PureComponent`) {
      return true;
    }
  }

  return false;
}

function classMemberName(member: SgNode<TSX>): string | null {
  return member.field("name")?.text() ?? member.field("property")?.text() ?? null;
}

function findClassField(classNode: SgNode<TSX>, name: string, requireStatic = false): SgNode<TSX> | null {
  const classBody = classBodyNode(classNode);
  if (!classBody) {
    return null;
  }

  for (const member of namedChildren(classBody)) {
    if (member.kind() !== "public_field_definition" && member.kind() !== "field_definition") {
      continue;
    }

    if (classMemberName(member) !== name) {
      continue;
    }

    if (requireStatic && !member.text().trimStart().startsWith("static ")) {
      continue;
    }

    return member;
  }

  return null;
}

function findClassMethod(classNode: SgNode<TSX>, name: string): SgNode<TSX> | null {
  const classBody = classBodyNode(classNode);
  if (!classBody) {
    return null;
  }

  for (const member of namedChildren(classBody)) {
    if (member.kind() !== "method_definition") {
      continue;
    }

    if (classMemberName(member) === name) {
      return member;
    }
  }

  return null;
}

function unwrapParenthesized(node: SgNode<TSX> | null): SgNode<TSX> | null {
  if (!node) {
    return null;
  }

  if (node.kind() !== "parenthesized_expression") {
    return node;
  }

  return firstNamedChild(node);
}

function firstReturnArgument(methodNode: SgNode<TSX>): SgNode<TSX> | null {
  const returnStatement = methodNode.find({ rule: { kind: "return_statement" } });
  if (!returnStatement) {
    return null;
  }

  return unwrapParenthesized(returnStatement.field("argument") ?? firstNamedChild(returnStatement));
}

function isRenderableJsx(node: SgNode<TSX> | null): boolean {
  return node?.kind() === "jsx_element" || node?.kind() === "jsx_self_closing_element" || node?.kind() === "jsx_fragment";
}

function lineStart(source: string, index: number): number {
  let cursor = index;
  while (cursor > 0 && source[cursor - 1] !== "\n" && source[cursor - 1] !== "\r") {
    cursor--;
  }
  return cursor;
}

function consumeLineBreak(source: string, index: number): number {
  if (source[index] === "\r" && source[index + 1] === "\n") {
    return index + 2;
  }

  if (source[index] === "\n" || source[index] === "\r") {
    return index + 1;
  }

  return index;
}

function consumeBlankLine(source: string, index: number): number {
  let cursor = index;
  while (cursor < source.length && (source[cursor] === " " || source[cursor] === "\t")) {
    cursor++;
  }

  if (cursor === index || (source[cursor] !== "\n" && source[cursor] !== "\r")) {
    return index;
  }

  return consumeLineBreak(source, cursor);
}

function removalEdit(source: string, node: SgNode<TSX>): Edit {
  const startPos = lineStart(source, node.range().start.index);
  let endPos = node.range().end.index;
  while (source[endPos] === " " || source[endPos] === "\t") {
    endPos++;
  }
  if (source[endPos] === ";") {
    endPos++;
  }
  endPos = consumeLineBreak(source, endPos);
  endPos = consumeBlankLine(source, endPos);

  return {
    startPos,
    endPos,
    insertedText: "",
  };
}

function insertionTarget(classNode: SgNode<TSX>): SgNode<TSX> {
  const parent = classNode.parent();
  return parent && parent.kind().startsWith("export") ? parent : classNode;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const metric = useMetricAtom("remove-legacy-context-replacements");
  const reactImportInfo = collectReactImportInfo(rootNode);
  const usedIdentifiers = collectUsedIdentifiers(rootNode);
  const edits: Edit[] = [];

  let helperReactObjectName = reactImportInfo.preferredReactObjectName;
  let needsReactHelperImport = false;
  let replacements = 0;

  for (const classNode of rootNode.findAll({ rule: { kind: "class_declaration" } })) {
    if (!isReactClassComponent(classNode, reactImportInfo)) {
      continue;
    }

    const childContextTypes = findClassField(classNode, "childContextTypes", true);
    const getChildContext = findClassMethod(classNode, "getChildContext");
    const renderMethod = findClassMethod(classNode, "render");

    if (!childContextTypes || !getChildContext || !renderMethod) {
      continue;
    }

    const childContextValue = firstReturnArgument(getChildContext);
    const renderedJsx = firstReturnArgument(renderMethod);
    if (!childContextValue || !renderedJsx) {
      continue;
    }

    if (!isRenderableJsx(renderedJsx)) {
      continue;
    }

    if (!helperReactObjectName) {
      helperReactObjectName = uniqueIdentifier("React", usedIdentifiers);
      needsReactHelperImport = true;
    }

    const contextName = uniqueIdentifier("Context", usedIdentifiers);
    const declarationTarget = insertionTarget(classNode);
    const declarationText = `const ${contextName} = ${helperReactObjectName}.createContext();\n\n`;
    const wrappedJsx = `<${contextName} value={${childContextValue.text()}}>${renderedJsx.text()}</${contextName}>`;

    edits.push({
      startPos: declarationTarget.range().start.index,
      endPos: declarationTarget.range().start.index,
      insertedText: declarationText,
    });
    edits.push(removalEdit(source, childContextTypes));
    edits.push(removalEdit(source, getChildContext));
    edits.push(renderedJsx.replace(wrappedJsx));
    replacements++;
  }

  if (replacements === 0) {
    return null;
  }

  if (needsReactHelperImport && helperReactObjectName) {
    const importEdit = addImport(rootNode, {
      type: "namespace",
      name: helperReactObjectName,
      from: "react",
    });
    if (importEdit) {
      const quoteMatch = source.match(/\bfrom\s+(['"])/);
      const quote = quoteMatch?.[1] === "'" ? "'" : '"';
      edits.push({
        ...importEdit,
        insertedText: importEdit.insertedText
          .replace(/"([^"]+)"/g, `${quote}$1${quote}`)
          .replace(/'([^']+)'/g, `${quote}$1${quote}`),
      });
    }
  }

  metric.increment({ file: metricFile(root.filename()) }, replacements);
  return rootNode.commitEdits(edits);
};

export default transform;
