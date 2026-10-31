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

function arrowFormalParameters(factory: SgNode<TSX>): SgNode<TSX> | null {
  const params = factory.field("parameters");
  if (params?.kind() === "formal_parameters") {
    return params;
  }

  return namedChildren(factory).find((child) => child.kind() === "formal_parameters") ?? null;
}

// Parameterless factories are `() => ...`. Any binding, default, rest, or
// destructuring parameter keeps its own scope and must stay as an invocation.
function isParameterlessArrow(factory: SgNode<TSX>): boolean {
  if (factory.field("parameter")) {
    return false;
  }

  const formal = arrowFormalParameters(factory);
  if (formal) {
    return namedChildren(formal).length === 0;
  }

  // `x => x` has no formal_parameters node; the binding is a named child that
  // is not the body (and not a type annotation / type parameters).
  const body = factory.field("body");
  return !namedChildren(factory).some((child) => {
    if (body && child.id() === body.id()) {
      return false;
    }
    const kind = child.kind();
    return kind !== "type_parameters" && kind !== "type_annotation" && kind !== "returning_type_annotation";
  });
}

function arrowReturnTypeAnnotation(factory: SgNode<TSX>): SgNode<TSX> | null {
  return (
    factory.field("return_type") ??
    namedChildren(factory).find(
      (child) => child.kind() === "type_annotation" || child.kind() === "returning_type_annotation",
    ) ??
    null
  );
}

function callTypeArgumentsText(call: SgNode<TSX>): string | null {
  const typeArgs = call.field("type_arguments");
  if (!typeArgs) {
    return null;
  }

  // type_arguments text is `<Config>` or `<A, B>`; strip the brackets.
  const text = typeArgs.text();
  if (text.startsWith("<") && text.endsWith(">")) {
    return text.slice(1, -1).trim();
  }

  return text.trim() || null;
}

function wrapExpressionText(call: SgNode<TSX>, expression: SgNode<TSX>): string {
  const bareParent = BARE_EXPRESSION_PARENTS.has(call.parent()?.kind() ?? "");
  const text = expression.text();
  return bareParent && expression.kind() !== "sequence_expression" ? text : `(${text})`;
}

function wrapRawExpressionText(call: SgNode<TSX>, text: string, forceParen = false): string {
  const bareParent = BARE_EXPRESSION_PARENTS.has(call.parent()?.kind() ?? "");
  return !forceParen && bareParent ? text : `(${text})`;
}

function invokeFactoryText(call: SgNode<TSX>, factory: SgNode<TSX>): string {
  if (factory.kind() === "identifier") {
    return `${factory.text()}()`;
  }

  // Member references must stay unbound: React calls the factory as a bare
  // function, so `(obj.compute)()` would incorrectly set `this` to `obj`.
  if (factory.kind() === "member_expression" || factory.kind() === "subscript_expression") {
    return `(0, ${factory.text()})()`;
  }

  return `(${factory.text()})()`;
}

// Extract the expression a useMemo factory evaluates to, when that is safe.
// Returns null when the factory must be invoked instead (params, async,
// return type annotation, non-trivial body, etc.).
function extractableUseMemoResult(factory: SgNode<TSX>): SgNode<TSX> | null {
  const unwrapped = unwrapParentheses(factory);

  if (unwrapped.kind() !== "arrow_function" || hasAnonymousChild(unwrapped, "async")) {
    return null;
  }

  if (!isParameterlessArrow(unwrapped) || arrowReturnTypeAnnotation(unwrapped)) {
    return null;
  }

  const body = unwrapped.field("body");
  if (!body) {
    return null;
  }

  if (body.kind() !== "statement_block") {
    return unwrapParentheses(body);
  }

  return soleReturnExpression(body);
}

function applyTypeAssertion(call: SgNode<TSX>, expressionText: string): string {
  const typeArgs = callTypeArgumentsText(call);
  if (!typeArgs) {
    return expressionText;
  }

  // `as` binds looser than most operators; parenthesize the asserted value and
  // wrap again when the call sits in an operator position.
  const asserted = `(${expressionText}) as ${typeArgs}`;
  const bareParent = BARE_EXPRESSION_PARENTS.has(call.parent()?.kind() ?? "");
  return bareParent ? asserted : `(${asserted})`;
}

// `useMemo(factory, deps)` evaluates to the factory's *result*, so the call is
// replaced by that result, not by the factory itself. Expression-bodied arrows
// and blocks that only return an expression become that expression;
// everything else is invoked in place.
function memoFactoryResultText(call: SgNode<TSX>, memoFactory: SgNode<TSX>): string {
  const factory = unwrapParentheses(memoFactory);
  const extracted = extractableUseMemoResult(factory);
  if (extracted) {
    // Preserve useMemo<T> contextual typing when the factory itself has no
    // return annotation (those keep the annotated IIFE path below).
    if (callTypeArgumentsText(call)) {
      return applyTypeAssertion(call, extracted.text());
    }
    return wrapExpressionText(call, extracted);
  }

  // Annotated arrows keep their return type by staying as invocations.
  // Type arguments on the call are redundant once the annotation remains.
  if (
    factory.kind() === "arrow_function" &&
    !hasAnonymousChild(factory, "async") &&
    arrowReturnTypeAnnotation(factory) &&
    isParameterlessArrow(factory)
  ) {
    return `(${factory.text()})()`;
  }

  const invoked = invokeFactoryText(call, factory);
  return callTypeArgumentsText(call) && !arrowReturnTypeAnnotation(factory)
    ? applyTypeAssertion(call, invoked)
    : invoked;
}

function memoizationResultText(
  match: MemoizationCall,
  selectedCallIds: Set<number>,
  namedImports: Map<string, string>,
  reactObjectNames: Set<string>,
): string | null {
  const firstArg = callArguments(match.call)[0] ?? null;
  if (!firstArg) {
    return null;
  }

  // Nested memoization: convert the inner call first, then apply this layer's
  // semantics to that result (useMemo invokes it; useCallback/memo keep it).
  if (selectedCallIds.has(firstArg.id()) && firstArg.kind() === "call_expression") {
    const inner = memoizationCallInfo(firstArg, namedImports, reactObjectNames);
    if (!inner) {
      return null;
    }

    const innerResult = memoizationResultText(inner, selectedCallIds, namedImports, reactObjectNames);
    if (innerResult === null) {
      return null;
    }

    if (match.importedName !== "useMemo") {
      return innerResult;
    }

    // Prefer AST-based unwrapping when the inner result is still an extractable
    // factory node (common for useCallback/memo wrappers). Otherwise invoke the
    // inner result text as the outer factory.
    if (inner.importedName !== "useMemo") {
      const innerFactory = callArguments(inner.call)[0];
      if (innerFactory) {
        return memoFactoryResultText(match.call, innerFactory);
      }
    }

    // Inner was useMemo: its result text is the outer factory value. If that
    // text is itself a parameterless expression-bodied arrow we can unwrap
    // once more via a lightweight parse of the common `() => expr` shape by
    // looking at the inner factory's extractable result and treating *that*
    // as the outer factory.
    const innerFactory = callArguments(inner.call)[0];
    if (innerFactory) {
      const innerExtracted = extractableUseMemoResult(unwrapParentheses(innerFactory));
      if (innerExtracted) {
        return memoFactoryResultText(match.call, innerExtracted);
      }
    }

    return wrapRawExpressionText(match.call, `(${innerResult})()`, true);
  }

  if (match.importedName === "useMemo") {
    return memoFactoryResultText(match.call, firstArg);
  }

  return firstArg.text();
}

function replacementText(
  match: MemoizationCall,
  selectedCallIds: Set<number>,
  namedImports: Map<string, string>,
  reactObjectNames: Set<string>,
): string | null {
  return memoizationResultText(match, selectedCallIds, namedImports, reactObjectNames);
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

function specifierLocalName(specifier: SgNode<TSX>): string {
  return specifier.field("alias")?.text() ?? specifier.field("name")?.text() ?? "";
}

// Removes several named specifiers from one statement that keeps at least one.
// Specifiers are matched by local binding name (alias or exported name) so two
// aliases of the same export can be removed independently. `removeImport`
// takes a separator with each specifier, so removing neighbours
// (`useCallback, useMemo`) one by one would produce overlapping edits. Each
// run of removed specifiers is instead cut up to the next kept one, or back
// to the previous kept one when the run is last, preserving formatting.
function removeSpecifierEdits(statement: SgNode<TSX>, unusedLocalNames: string[]): Edit[] {
  const unused = new Set(unusedLocalNames);
  const specifiers = statement.findAll({ rule: { kind: "import_specifier" } });
  const removed = specifiers.map((specifier) => unused.has(specifierLocalName(specifier)));
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

      // Track unused *local* bindings, not exported names, so `useMemo as a`
      // can be removed while `useMemo as b` remains.
      const unusedLocalsInStatement: string[] = [];
      const unusedExportNames = new Set<string>();
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
            unusedLocalsInStatement.push(sibling.alias);
            unusedExportNames.add(memoName);
          }
        }
      }

      const removingAllNamed = unusedLocalsInStatement.length >= namedSpecifierCount(statement);
      const binding = defaultOrNamespaceLocal(statement);
      const keepBinding = binding ? keepObjectImport(binding.alias) : false;

      if (removingAllNamed) {
        // removeImport drops the whole statement, or only the `, { ... }` clause
        // when a default/namespace binding must stay.
        const removeEdit = removeImport(rootNode, {
          type: "named",
          specifiers: [...unusedExportNames],
          from: "react",
        }) ?? (!keepBinding && binding
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

      // Partial removal: match by local binding so duplicate export aliases
      // (`useMemo as a` vs `useMemo as b`) can be removed independently.
      // removeImport matches the first export name and would delete the wrong one.
      if (unusedLocalsInStatement.length > 0) {
        edits.push(...removeSpecifierEdits(statement, unusedLocalsInStatement));
        handledStatements.add(statement.id());
        continue;
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
    const replacement = replacementText(match, selectedCallIds, namedImports, reactObjectNames);
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
