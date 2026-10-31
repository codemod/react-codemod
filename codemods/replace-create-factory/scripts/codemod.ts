import type { Edit, SgNode, Transform } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getAllImports, getImport, removeImport } from "@jssg/utils/javascript/imports";

const IDENTIFIER_KINDS = ["identifier", "type_identifier"] as const;

type Range = {
  start: number;
  end: number;
};

type CreateFactoryCall = {
  call: SgNode<TSX>;
  pattern: "createFactory" | "React.createFactory";
};

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

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) {
    return fragment.text();
  }

  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  return namedChildren(call.field("arguments"));
}

function nodeRange(node: SgNode<TSX>): Range {
  const range = node.range();
  return {
    start: range.start.index,
    end: range.end.index,
  };
}

function containsIndex(outer: Range, index: number): boolean {
  return outer.start <= index && index < outer.end;
}

function collectNamedCreateFactoryImports(
  rootNode: SgNode<TSX, "program">,
): Set<string> {
  const names = new Set<string>();

  for (const imp of getAllImports(rootNode, {
    type: "named",
    name: "createFactory",
    from: "react",
  })) {
    if (!imp.isNamespace) {
      names.add(imp.alias);
    }
  }

  return names;
}

function collectReactObjectNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const imp of getAllImports(rootNode, { type: "default", from: "react" })) {
    names.add(imp.alias);
  }

  return names;
}

function createFactoryCallInfo(
  call: SgNode<TSX>,
  namedImports: Set<string>,
  reactObjectNames: Set<string>,
): CreateFactoryCall | null {
  const callee = call.field("function");
  if (!callee) {
    return null;
  }

  if (callee.kind() === "identifier") {
    return namedImports.has(callee.text()) ? { call, pattern: "createFactory" } : null;
  }

  if (callee.kind() !== "member_expression") {
    return null;
  }

  const object = callee.field("object");
  const property = callee.field("property");
  if (
    object?.kind() !== "identifier" ||
    !reactObjectNames.has(object.text()) ||
    property?.text() !== "createFactory"
  ) {
    return null;
  }

  return { call, pattern: "React.createFactory" };
}

function createFactoryReplacement(call: SgNode<TSX>): string | null {
  const firstArg = callArguments(call)[0] ?? null;
  if (!firstArg) {
    return null;
  }

  if (firstArg.kind() === "string") {
    const tagName = sourceText(firstArg);
    return tagName ? `<${tagName} />` : null;
  }

  if (firstArg.kind() === "identifier") {
    return `<${firstArg.text()} />`;
  }

  return null;
}

function isInsideImport(node: SgNode<TSX>): boolean {
  return node.ancestors().some((ancestor) => ancestor.kind() === "import_statement");
}

function selectedAncestorForIndex(index: number, selectedCalls: SgNode<TSX>[]): SgNode<TSX> | null {
  for (const call of selectedCalls) {
    if (containsIndex(nodeRange(call), index)) {
      return call;
    }
  }

  return null;
}

function collectUsedImportLocals(
  rootNode: SgNode<TSX, "program">,
  importedLocalNames: Set<string>,
  selectedCalls: SgNode<TSX>[],
): Set<string> {
  const usedNames = new Set<string>();

  for (const kind of IDENTIFIER_KINDS) {
    for (const node of rootNode.findAll({ rule: { kind } })) {
      const name = node.text();
      if (!importedLocalNames.has(name) || isInsideImport(node)) {
        continue;
      }

      if (!selectedAncestorForIndex(node.range().start.index, selectedCalls)) {
        usedNames.add(name);
      }
    }
  }

  return usedNames;
}

function importStatementForBinding(node: SgNode<TSX>): SgNode<TSX> | null {
  return node.ancestors().find((ancestor) => ancestor.kind() === "import_statement") ?? null;
}

function namedSpecifierCount(importNode: SgNode<TSX>): number {
  return importNode.findAll({ rule: { kind: "import_specifier" } }).length;
}

function defaultOrNamespaceLocal(
  importNode: SgNode<TSX>,
): { alias: string; isNamespace: boolean } | null {
  const clause = importNode.find({ rule: { kind: "import_clause" } });
  if (!clause) {
    return null;
  }

  const namespace = clause.find({ rule: { kind: "namespace_import" } });
  const namespaceName = namespace?.field("name") ?? namespace?.find({ rule: { kind: "identifier" } });
  if (namespaceName) {
    return { alias: namespaceName.text(), isNamespace: true };
  }

  const defaultIdent = clause.children().find((child) => child.kind() === "identifier");
  return defaultIdent ? { alias: defaultIdent.text(), isNamespace: false } : null;
}

function consumeFollowingBlankLine(edit: Edit, programText: string): Edit {
  if (edit.insertedText !== "" || edit.startPos !== 0) {
    return edit;
  }

  let cursor = edit.endPos;
  while (cursor < programText.length && (programText[cursor] === " " || programText[cursor] === "\t")) {
    cursor++;
  }

  if (programText.slice(cursor, cursor + 2) === "\r\n") {
    return { ...edit, endPos: cursor + 2 };
  }

  if (programText[cursor] === "\n" || programText[cursor] === "\r") {
    return { ...edit, endPos: cursor + 1 };
  }

  return edit;
}

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function removeSpecifierEdit(specifier: SgNode<TSX>, programText: string): Edit {
  let start = specifier.range().start.index;
  let end = specifier.range().end.index;

  let i = end;
  while (isWhitespace(programText[i])) i++;
  if (programText[i] === ",") {
    end = i + 1;
    while (isWhitespace(programText[end])) end++;
  } else {
    let j = start - 1;
    while (isWhitespace(programText[j])) j--;
    if (programText[j] === ",") start = j;
  }

  return { startPos: start, endPos: end, insertedText: "" };
}

function findCreateFactorySpecifier(
  statement: SgNode<TSX>,
  localAlias: string,
): SgNode<TSX> | null {
  for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
    const imported = specifier.field("name")?.text();
    if (imported !== "createFactory") {
      continue;
    }
    const local = specifier.field("alias")?.text() ?? imported;
    if (local === localAlias) {
      return specifier;
    }
  }
  return null;
}

function cleanupUnusedImports(
  rootNode: SgNode<TSX, "program">,
  usedImportLocals: Set<string>,
  edits: Edit[],
): void {
  const programText = rootNode.text();
  const unusedCreateFactory = getAllImports(rootNode, {
    type: "named",
    name: "createFactory",
    from: "react",
  }).filter((imp) => !imp.isNamespace && !usedImportLocals.has(imp.alias));

  // removeImport only clears the first matching specifier in the file, so when
  // createFactory appears in multiple react imports we remove later ones via
  // their specifier nodes directly.
  let usedRemoveImport = false;

  for (const imp of unusedCreateFactory) {
    const statement = importStatementForBinding(imp.node);
    if (!statement) {
      continue;
    }

    const binding = defaultOrNamespaceLocal(statement);
    const keepBinding = binding ? usedImportLocals.has(binding.alias) : false;
    const onlyCreateFactory = namedSpecifierCount(statement) === 1;

    if (onlyCreateFactory && !keepBinding) {
      if (!usedRemoveImport) {
        const removeEdit = removeImport(rootNode, {
          type: "named",
          specifiers: ["createFactory"],
          from: "react",
        });
        if (removeEdit) {
          edits.push(consumeFollowingBlankLine(removeEdit, programText));
          usedRemoveImport = true;
          continue;
        }
      }

      const range = statement.range();
      let end = range.end.index;
      if (programText.slice(end, end + 2) === "\r\n") end += 2;
      else if (programText[end] === "\n" || programText[end] === "\r") end++;
      edits.push(consumeFollowingBlankLine(
        { startPos: range.start.index, endPos: end, insertedText: "" },
        programText,
      ));
      continue;
    }

    if (!usedRemoveImport) {
      const removeEdit = removeImport(rootNode, {
        type: "named",
        specifiers: ["createFactory"],
        from: "react",
      });
      if (removeEdit) {
        const stmtRange = nodeRange(statement);
        if (
          removeEdit.startPos >= stmtRange.start &&
          removeEdit.endPos <= stmtRange.end
        ) {
          edits.push(removeEdit);
          usedRemoveImport = true;
          continue;
        }
      }
    }

    const specifier = findCreateFactorySpecifier(statement, imp.alias);
    if (specifier) {
      edits.push(removeSpecifierEdit(specifier, programText));
    }
  }

  for (const imp of getAllImports(rootNode, { type: "default", from: "react" })) {
    if (usedImportLocals.has(imp.alias)) {
      continue;
    }

    const statement = importStatementForBinding(imp.node);
    if (!statement || namedSpecifierCount(statement) > 0) {
      continue;
    }

    const removeEdit = removeImport(rootNode, {
      type: imp.isNamespace ? "namespace" : "default",
      from: "react",
    });
    if (removeEdit) {
      edits.push(consumeFollowingBlankLine(removeEdit, programText));
    }
  }
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();

  const namedImports = collectNamedCreateFactoryImports(rootNode);
  const reactObjectNames = collectReactObjectNames(rootNode);
  if (namedImports.size === 0 && reactObjectNames.size === 0) {
    return null;
  }

  if (
    namedImports.size === 0 &&
    !getImport(rootNode, { type: "default", from: "react" })
  ) {
    return null;
  }

  const matches: CreateFactoryCall[] = [];
  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const match = createFactoryCallInfo(call, namedImports, reactObjectNames);
    if (!match) {
      continue;
    }

    if (createFactoryReplacement(call)) {
      matches.push(match);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  const edits: Edit[] = [];
  const metric = useMetricAtom("replace-create-factory-replacements");
  const metricCounts = new Map<string, number>();
  const selectedCalls = matches.map((match) => match.call);

  for (const match of matches) {
    const replacement = createFactoryReplacement(match.call);
    if (!replacement) {
      continue;
    }

    edits.push(match.call.replace(replacement));
    metricCounts.set(match.pattern, (metricCounts.get(match.pattern) ?? 0) + 1);
  }

  const importedLocalNames = new Set<string>([
    ...namedImports,
    ...reactObjectNames,
  ]);

  const usedImportLocals = collectUsedImportLocals(rootNode, importedLocalNames, selectedCalls);
  cleanupUnusedImports(rootNode, usedImportLocals, edits);

  for (const [pattern, count] of metricCounts) {
    metric.increment({
      file: metricFile(root.filename()),
      pattern,
    }, count);
  }

  return rootNode.commitEdits(edits);
};

export default transform;
