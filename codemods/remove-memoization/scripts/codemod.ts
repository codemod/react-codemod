import type { Edit, SgNode, Transform } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { getAllImports, getImport, removeImport } from "@jssg/utils/javascript/imports";

const MEMOIZATION_IMPORTS = new Set(["useMemo", "useCallback", "memo"]);
const MEMOIZATION_NAMES = ["useMemo", "useCallback", "memo"] as const;
const IDENTIFIER_KINDS = ["identifier", "type_identifier"] as const;

type Range = {
  start: number;
  end: number;
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

function collectNamedMemoizationImports(
  rootNode: SgNode<TSX, "program">,
): Map<string, string> {
  const namedImports = new Map<string, string>();

  for (const name of MEMOIZATION_NAMES) {
    for (const imp of getAllImports(rootNode, { type: "named", name, from: "react" })) {
      if (!imp.isNamespace) {
        namedImports.set(imp.alias, name);
      }
    }
  }

  return namedImports;
}

function collectReactObjectNames(rootNode: SgNode<TSX, "program">): Set<string> {
  const names = new Set<string>();

  for (const imp of getAllImports(rootNode, { type: "default", from: "react" })) {
    names.add(imp.alias);
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

// Parents where an arbitrary expression can stand in for the call without
// extra parentheses. Anywhere else (`a + useMemo(...)`, `!useMemo(...)`) the
// factory result is wrapped so operator precedence is preserved.
const BARE_EXPRESSION_PARENTS = new Set([
  "variable_declarator",
  "assignment_expression",
  "return_statement",
  "arguments",
  "array",
  "pair",
  "jsx_expression",
  "parenthesized_expression",
]);

function hasAnonymousChild(node: SgNode<TSX>, text: string): boolean {
  return node.children().some((child) => !child.isNamed() && child.text() === text);
}

function unwrapParentheses(node: SgNode<TSX>): SgNode<TSX> {
  let current = node;
  while (current.kind() === "parenthesized_expression") {
    const inner = namedChildren(current)[0];
    if (!inner) {
      return current;
    }
    current = inner;
  }
  return current;
}

// The expression returned by a block that is nothing but `return <expr>;`.
// Any other statement or comment in the block means it is kept as an IIFE.
function soleReturnExpression(block: SgNode<TSX>): SgNode<TSX> | null {
  const statements = block.children().filter((child) => child.isNamed());
  const statement = statements[0];
  if (statements.length !== 1 || statement?.kind() !== "return_statement") {
    return null;
  }

  return namedChildren(statement)[0] ?? null;
}

// `useMemo(factory, deps)` evaluates to the factory's *result*, so the call is
// replaced by that result, not by the factory itself. Expression-bodied arrows
// and blocks that only return an expression become that expression;
// everything else is invoked in place.
function memoFactoryResultText(call: SgNode<TSX>, memoFactory: SgNode<TSX>): string {
  const bareParent = BARE_EXPRESSION_PARENTS.has(call.parent()?.kind() ?? "");
  const wrap = (expression: SgNode<TSX>) => {
    const text = expression.text();
    return bareParent && expression.kind() !== "sequence_expression" ? text : `(${text})`;
  };
  const factory = unwrapParentheses(memoFactory);

  if (factory.kind() === "arrow_function" && !hasAnonymousChild(factory, "async")) {
    const body = factory.field("body");
    if (body && body.kind() !== "statement_block") {
      return wrap(unwrapParentheses(body));
    }

    const returned = body ? soleReturnExpression(body) : null;
    if (returned) {
      return wrap(returned);
    }
  }

  if (factory.kind() === "identifier") {
    return `${factory.text()}()`;
  }

  return `(${factory.text()})()`;
}

function replacementText(
  match: MemoizationCall,
  selectedCallIds: Set<number>,
): string | null {
  const firstArg = firstMemoizationArgument(match.call, selectedCallIds);
  if (!firstArg) {
    return null;
  }

  if (match.importedName === "useMemo") {
    return memoFactoryResultText(match.call, firstArg);
  }

  return firstArg.text();
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

function topLevelSelectedCalls(matches: MemoizationCall[]): MemoizationCall[] {
  const allRanges = matches.map((match) => ({ match, range: nodeRange(match.call) }));

  return allRanges
    .filter(({ match, range }) =>
      !allRanges.some((candidate) => candidate.match.call.id() !== match.call.id() && contains(candidate.range, range))
    )
    .map(({ match }) => match);
}

function importStatementForBinding(node: SgNode<TSX>): SgNode<TSX> | null {
  return node.ancestors().find((ancestor) => ancestor.kind() === "import_statement") ?? null;
}

function namedSpecifierCount(importNode: SgNode<TSX>): number {
  return importNode.findAll({ rule: { kind: "import_specifier" } }).length;
}

function defaultOrNamespaceLocal(importNode: SgNode<TSX>): { alias: string; isNamespace: boolean } | null {
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

// Removes several named specifiers from one statement that keeps at least one.
// `removeImport` takes a separator with each specifier, so removing neighbours
// (`useCallback, useMemo`) one by one would produce overlapping edits. Each
// run of removed specifiers is instead cut up to the next kept one, or back
// to the previous kept one when the run is last, preserving formatting.
function removeSpecifierEdits(statement: SgNode<TSX>, importedNames: string[]): Edit[] {
  const specifiers = statement.findAll({ rule: { kind: "import_specifier" } });
  const removed = specifiers.map((specifier) => importedNames.includes(specifier.field("name")?.text() ?? ""));
  const edits: Edit[] = [];

  for (let index = 0; index < specifiers.length; index++) {
    if (!removed[index] || removed[index - 1]) {
      continue;
    }

    let runEnd = index;
    while (removed[runEnd + 1]) {
      runEnd++;
    }

    const next = specifiers[runEnd + 1];
    const previous = specifiers[index - 1];
    if (next) {
      edits.push({ startPos: nodeRange(specifiers[index]!).start, endPos: nodeRange(next).start, insertedText: "" });
    } else if (previous) {
      edits.push({ startPos: nodeRange(previous).end, endPos: nodeRange(specifiers[runEnd]!).end, insertedText: "" });
    }
  }

  return edits;
}

function cleanupUnusedImports(
  rootNode: SgNode<TSX, "program">,
  usedImportLocals: Set<string>,
  referencedImportLocals: Set<string>,
  edits: Edit[],
): void {
  // A default or namespace import is only removed when this codemod is what
  // made it unused; one that was already unused is left in place.
  const keepObjectImport = (alias: string) =>
    usedImportLocals.has(alias) || !referencedImportLocals.has(alias);

  const programText = rootNode.text();
  const handledStatements = new Set<number>();

  for (const name of MEMOIZATION_NAMES) {
    for (const imp of getAllImports(rootNode, { type: "named", name, from: "react" })) {
      if (imp.isNamespace || usedImportLocals.has(imp.alias)) {
        continue;
      }

      const statement = importStatementForBinding(imp.node);
      if (!statement || handledStatements.has(statement.id())) {
        continue;
      }

      const unusedInStatement: string[] = [];
      for (const memoName of MEMOIZATION_NAMES) {
        for (const sibling of getAllImports(rootNode, {
          type: "named",
          name: memoName,
          from: "react",
        })) {
          if (sibling.isNamespace || usedImportLocals.has(sibling.alias)) {
            continue;
          }
          if (importStatementForBinding(sibling.node)?.id() === statement.id()) {
            unusedInStatement.push(memoName);
          }
        }
      }

      const removingAllNamed = unusedInStatement.length >= namedSpecifierCount(statement);
      const binding = defaultOrNamespaceLocal(statement);
      const keepBinding = binding ? keepObjectImport(binding.alias) : false;

      if (removingAllNamed && !keepBinding) {
        // Drop the whole statement in one edit (avoids overlapping default+named removals).
        const removeEdit = removeImport(rootNode, {
          type: "named",
          specifiers: unusedInStatement,
          from: "react",
        }) ?? (binding
          ? removeImport(rootNode, {
              type: binding.isNamespace ? "namespace" : "default",
              from: "react",
            })
          : null);

        if (removeEdit) {
          edits.push(consumeFollowingBlankLine(removeEdit, programText));
          handledStatements.add(statement.id());
        }
        continue;
      }

      if (!removingAllNamed && unusedInStatement.length > 1) {
        edits.push(...removeSpecifierEdits(statement, unusedInStatement));
        handledStatements.add(statement.id());
        continue;
      }

      const removeEdit = removeImport(rootNode, {
        type: "named",
        specifiers: removingAllNamed ? unusedInStatement : [name],
        from: "react",
      });

      if (removeEdit) {
        edits.push(consumeFollowingBlankLine(removeEdit, programText));
        if (removingAllNamed) {
          handledStatements.add(statement.id());
        }
      }
    }
  }

  for (const imp of getAllImports(rootNode, { type: "default", from: "react" })) {
    if (keepObjectImport(imp.alias)) {
      continue;
    }

    const statement = importStatementForBinding(imp.node);
    if (!statement || handledStatements.has(statement.id())) {
      continue;
    }

    // Pure default/namespace imports only — mixed clauses with remaining named
    // bindings are left to named cleanup above.
    if (namedSpecifierCount(statement) > 0) {
      continue;
    }

    const removeEdit = removeImport(rootNode, {
      type: imp.isNamespace ? "namespace" : "default",
      from: "react",
    });
    if (removeEdit) {
      edits.push(consumeFollowingBlankLine(removeEdit, programText));
      handledStatements.add(statement.id());
    }
  }
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();

  const namedImports = collectNamedMemoizationImports(rootNode);
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
    const replacement = replacementText(match, selectedCallIds);
    if (!replacement) {
      continue;
    }

    edits.push(match.call.replace(replacement));
    metricCounts.set(match.importedName, (metricCounts.get(match.importedName) ?? 0) + 1);
  }

  if (edits.length === 0) {
    return null;
  }

  const importedLocalNames = new Set<string>([
    ...namedImports.keys(),
    ...reactObjectNames,
  ]);

  const usedImportLocals = collectUsedImportLocals(
    rootNode,
    importedLocalNames,
    selectedCalls,
    selectedCallIds,
  );

  const referencedImportLocals = collectUsedImportLocals(rootNode, importedLocalNames, [], selectedCallIds);

  cleanupUnusedImports(rootNode, usedImportLocals, referencedImportLocals, edits);

  for (const [pattern, count] of metricCounts) {
    metric.increment({
      pattern,
      file: metricFile(root.filename()),
    }, count);
  }

  return rootNode.commitEdits(edits);
};

export default transform;
