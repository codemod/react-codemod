import type { Edit, SgNode, Transform } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

const MEMOIZATION_IMPORTS = new Set(["useMemo", "useCallback", "memo"]);
const IDENTIFIER_KINDS = ["identifier", "type_identifier"] as const;

type Range = {
  start: number;
  end: number;
};

type ImportSpecifierInfo = {
  node: SgNode<TSX>;
  localName: string;
  importedName: string;
  kind: "default" | "namespace" | "named";
};

type ReactImportInfo = {
  importNode: SgNode<TSX>;
  sourceNode: SgNode<TSX>;
  defaultSpecifier: ImportSpecifierInfo | null;
  namespaceSpecifier: ImportSpecifierInfo | null;
  namedSpecifiers: ImportSpecifierInfo[];
};

type MemoizationCall = {
  call: SgNode<TSX>;
  importedName: string;
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

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
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

function contains(outer: Range, inner: Range): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

function containsIndex(outer: Range, index: number): boolean {
  return outer.start <= index && index < outer.end;
}

function sourceQuote(sourceNode: SgNode<TSX>): string {
  return sourceNode.text().startsWith("'") ? "'" : "\"";
}

function collectReactImports(rootNode: SgNode<TSX, "program">): ReactImportInfo[] {
  const imports: ReactImportInfo[] = [];

  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (importSource(importNode) !== "react") {
      continue;
    }

    const sourceNode = importNode.field("source") ?? importNode.find({ rule: { kind: "string" } });
    if (!sourceNode) {
      continue;
    }

    const importClause = importNode.find({ rule: { kind: "import_clause" } });
    const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier") ?? null;
    const namespaceImport = importClause?.find({ rule: { kind: "namespace_import" } }) ?? null;
    const namespaceName = namespaceImport?.field("name") ?? namespaceImport?.find({ rule: { kind: "identifier" } }) ?? null;

    const namedSpecifiers = importNode.findAll({ rule: { kind: "import_specifier" } }).flatMap((specifier) => {
      const importedName = specifier.field("name")?.text();
      if (!importedName) {
        return [];
      }

      return [{
        node: specifier,
        localName: specifier.field("alias")?.text() ?? importedName,
        importedName,
        kind: "named" as const,
      }];
    });

    imports.push({
      importNode,
      sourceNode,
      defaultSpecifier: defaultIdentifier
        ? {
            node: defaultIdentifier,
            localName: defaultIdentifier.text(),
            importedName: "default",
            kind: "default",
          }
        : null,
      namespaceSpecifier: namespaceName && namespaceImport
        ? {
            node: namespaceImport,
            localName: namespaceName.text(),
            importedName: "namespace",
            kind: "namespace",
          }
        : null,
      namedSpecifiers,
    });
  }

  return imports;
}

function buildNamedImportMap(reactImports: ReactImportInfo[]): Map<string, string> {
  const namedImports = new Map<string, string>();

  for (const reactImport of reactImports) {
    for (const specifier of reactImport.namedSpecifiers) {
      if (MEMOIZATION_IMPORTS.has(specifier.importedName)) {
        namedImports.set(specifier.localName, specifier.importedName);
      }
    }
  }

  return namedImports;
}

function buildReactObjectNames(reactImports: ReactImportInfo[]): Set<string> {
  const names = new Set<string>();

  for (const reactImport of reactImports) {
    if (reactImport.defaultSpecifier) {
      names.add(reactImport.defaultSpecifier.localName);
    }

    if (reactImport.namespaceSpecifier) {
      names.add(reactImport.namespaceSpecifier.localName);
    }
  }

  return names;
}

function memberExpressionRoot(node: SgNode<TSX>): SgNode<TSX> | null {
  const object = node.field("object");
  if (!object) {
    return null;
  }

  if (object.kind() === "identifier") {
    return object;
  }

  if (object.kind() === "member_expression") {
    return memberExpressionRoot(object);
  }

  return null;
}

function memoizationCallInfo(
  call: SgNode<TSX>,
  namedImports: Map<string, string>,
  reactObjectNames: Set<string>,
): MemoizationCall | null {
  const callee = call.field("function");
  if (!callee) {
    return null;
  }

  if (callee.kind() === "identifier") {
    const importedName = namedImports.get(callee.text());
    return importedName ? { call, importedName } : null;
  }

  if (callee.kind() !== "member_expression") {
    return null;
  }

  const property = callee.field("property");
  const rootObject = memberExpressionRoot(callee);
  if (!property || !rootObject || !reactObjectNames.has(rootObject.text())) {
    return null;
  }

  const importedName = property.text();
  return MEMOIZATION_IMPORTS.has(importedName) ? { call, importedName } : null;
}

function firstMemoizationArgument(
  call: SgNode<TSX>,
  selectedCallIds: Set<number>,
): SgNode<TSX> | null {
  const firstArg = callArguments(call)[0] ?? null;
  if (!firstArg) {
    return null;
  }

  if (selectedCallIds.has(firstArg.id())) {
    return firstMemoizationArgument(firstArg, selectedCallIds);
  }

  return firstArg;
}

function replacementText(call: SgNode<TSX>, selectedCallIds: Set<number>): string | null {
  return firstMemoizationArgument(call, selectedCallIds)?.text() ?? null;
}

function keptRanges(call: SgNode<TSX>, selectedCallIds: Set<number>): Range[] {
  const firstArg = callArguments(call)[0] ?? null;
  if (!firstArg) {
    return [];
  }

  if (selectedCallIds.has(firstArg.id())) {
    return keptRanges(firstArg, selectedCallIds);
  }

  return [nodeRange(firstArg)];
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
  selectedCallIds: Set<number>,
): Set<string> {
  const usedNames = new Set<string>();
  const selectedKeptRanges = new Map<number, Range[]>();

  for (const call of selectedCalls) {
    selectedKeptRanges.set(call.id(), keptRanges(call, selectedCallIds));
  }

  for (const kind of IDENTIFIER_KINDS) {
    for (const node of rootNode.findAll({ rule: { kind } })) {
      const name = node.text();
      if (!importedLocalNames.has(name) || isInsideImport(node)) {
        continue;
      }

      const nodeStart = node.range().start.index;
      const selectedAncestor = selectedAncestorForIndex(nodeStart, selectedCalls);
      if (!selectedAncestor) {
        usedNames.add(name);
        continue;
      }

      const ranges = selectedKeptRanges.get(selectedAncestor.id()) ?? [];
      if (ranges.some((range) => containsIndex(range, nodeStart))) {
        usedNames.add(name);
      }
    }
  }

  return usedNames;
}

function importStatementReplacement(
  reactImport: ReactImportInfo,
  usedImportLocals: Set<string>,
  sourceCode: string,
): Edit {
  const keptNamedSpecifiers = reactImport.namedSpecifiers.filter((specifier) => usedImportLocals.has(specifier.localName));
  const keepDefault = reactImport.defaultSpecifier ? usedImportLocals.has(reactImport.defaultSpecifier.localName) : false;
  const keepNamespace = reactImport.namespaceSpecifier ? usedImportLocals.has(reactImport.namespaceSpecifier.localName) : false;

  const range = nodeRange(reactImport.importNode);
  const allRemoved = !keepDefault && !keepNamespace && keptNamedSpecifiers.length === 0;
  if (allRemoved) {
    return removeImportStatementEdit(sourceCode, range);
  }

  const clauses: string[] = [];
  if (keepDefault && reactImport.defaultSpecifier) {
    clauses.push(reactImport.defaultSpecifier.node.text());
  }

  if (keepNamespace && reactImport.namespaceSpecifier) {
    clauses.push(reactImport.namespaceSpecifier.node.text());
  }

  if (keptNamedSpecifiers.length > 0) {
    clauses.push(`{ ${keptNamedSpecifiers.map((specifier) => specifier.node.text()).join(", ")} }`);
  }

  const quote = sourceQuote(reactImport.sourceNode);
  return {
    startPos: range.start,
    endPos: range.end,
    insertedText: `import ${clauses.join(", ")} from ${quote}react${quote};`,
  };
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

  if (source[cursor] !== "\n" && source[cursor] !== "\r") {
    return index;
  }

  return consumeLineBreak(source, cursor);
}

function removeImportStatementEdit(source: string, range: Range): Edit {
  const start = lineStart(source, range.start);
  let end = consumeLineBreak(source, range.end);

  if (start === 0) {
    end = consumeBlankLine(source, end);
  }

  return {
    startPos: start,
    endPos: end,
    insertedText: "",
  };
}

function topLevelSelectedCalls(matches: MemoizationCall[]): MemoizationCall[] {
  const allRanges = matches.map((match) => ({ match, range: nodeRange(match.call) }));

  return allRanges
    .filter(({ match, range }) =>
      !allRanges.some((candidate) => candidate.match.call.id() !== match.call.id() && contains(candidate.range, range))
    )
    .map(({ match }) => match);
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const reactImports = collectReactImports(rootNode);
  if (reactImports.length === 0) {
    return null;
  }

  const namedImports = buildNamedImportMap(reactImports);
  const reactObjectNames = buildReactObjectNames(reactImports);
  if (namedImports.size === 0 && reactObjectNames.size === 0) {
    return null;
  }

  const allMatches: MemoizationCall[] = [];
  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const match = memoizationCallInfo(call, namedImports, reactObjectNames);
    if (match && callArguments(call).length > 0) {
      allMatches.push(match);
    }
  }

  if (allMatches.length === 0) {
    return null;
  }

  const selectedMatches = topLevelSelectedCalls(allMatches);
  const selectedCalls = selectedMatches.map((match) => match.call);
  const selectedCallIds = new Set(allMatches.map((match) => match.call.id()));
  const edits: Edit[] = [];
  const metric = useMetricAtom("remove-memoization-replacements");
  const metricCounts = new Map<string, number>();

  for (const match of selectedMatches) {
    const replacement = replacementText(match.call, selectedCallIds);
    if (!replacement) {
      continue;
    }

    edits.push(match.call.replace(replacement));
    metricCounts.set(match.importedName, (metricCounts.get(match.importedName) ?? 0) + 1);
  }

  if (edits.length === 0) {
    return null;
  }

  const importedLocalNames = new Set<string>();
  for (const reactImport of reactImports) {
    if (reactImport.defaultSpecifier) {
      importedLocalNames.add(reactImport.defaultSpecifier.localName);
    }
    if (reactImport.namespaceSpecifier) {
      importedLocalNames.add(reactImport.namespaceSpecifier.localName);
    }
    for (const specifier of reactImport.namedSpecifiers) {
      importedLocalNames.add(specifier.localName);
    }
  }

  const usedImportLocals = collectUsedImportLocals(rootNode, importedLocalNames, selectedCalls, selectedCallIds);
  const sourceCode = rootNode.text();
  for (const reactImport of reactImports) {
    const edit = importStatementReplacement(reactImport, usedImportLocals, sourceCode);
    if (edit.insertedText !== reactImport.importNode.text()) {
      edits.push(edit);
    }
  }

  for (const [pattern, count] of metricCounts) {
    metric.increment({
      pattern,
      file: metricFile(root.filename()),
    }, count);
  }

  return rootNode.commitEdits(edits);
};

export default transform;
