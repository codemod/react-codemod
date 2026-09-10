import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

const REACT_MODULE = "react";
const REACT_DOM_MODULE = "react-dom";
const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"]);

type ReactBindings = {
  /** Local names that refer to the React module object (default or namespace import). */
  namespaces: Set<string>;
  /** React export name -> local name for named imports. */
  named: Map<string, string>;
  /** The first ESM import from "react" (used to add specifiers). */
  firstImport: SgNode<TSX> | null;
  /** The first ESM import from "react-dom" that has named imports. */
  firstDomNamedImport: SgNode<TSX> | null;
  /** react-dom export name -> local name for named imports. */
  domNamed: Map<string, string>;
  lastImport: SgNode<TSX> | null;
};

type HookCall = { style: "named"; localName: string } | { style: "member"; object: string };

type MountedPattern = {
  stateStmt: SgNode<TSX>;
  effectStmt: SgNode<TSX>;
  guardStmt: SgNode<TSX>;
  stateName: string;
  setterName: string;
  fallback: SgNode<TSX> | null;
  hookStyle: HookCall;
};

type ComponentMatch = {
  fnNode: SgNode<TSX>;
  nameNode: SgNode<TSX>;
  topStmt: SgNode<TSX>;
  declarator: SgNode<TSX> | null;
  pattern: MountedPattern;
};

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

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function isTypeOnlyImport(node: SgNode<TSX>): boolean {
  return node.children().some((child) => !child.isNamed() && child.text() === "type");
}

function quoteOf(importNode: SgNode<TSX> | null): string {
  const source = importNode?.field("source") ?? importNode?.find({ rule: { kind: "string" } });
  return source?.text().startsWith("'") ? "'" : '"';
}

function collectReactBindings(rootNode: SgNode<TSX, "program">): ReactBindings {
  const bindings: ReactBindings = {
    namespaces: new Set(),
    named: new Map(),
    firstImport: null,
    firstDomNamedImport: null,
    domNamed: new Map(),
    lastImport: null,
  };

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (imp.parent()?.kind() !== "program") continue;
    bindings.lastImport = imp;
    const source = importSource(imp);
    if (source !== REACT_MODULE && source !== REACT_DOM_MODULE) continue;
    if (isTypeOnlyImport(imp)) continue;

    const named = source === REACT_MODULE ? bindings.named : bindings.domNamed;
    for (const specifier of imp.findAll({ rule: { kind: "import_specifier" } })) {
      const name = specifier.field("name")?.text();
      if (!name) continue;
      named.set(name, specifier.field("alias")?.text() ?? name);
    }

    if (source === REACT_MODULE) {
      if (!bindings.firstImport) bindings.firstImport = imp;
      const importClause = imp.find({ rule: { kind: "import_clause" } });
      const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");
      if (defaultIdentifier) bindings.namespaces.add(defaultIdentifier.text());
      const namespaceImport = imp.find({ rule: { kind: "namespace_import" } });
      const namespaceName = namespaceImport?.field("name") ?? namespaceImport?.find({ rule: { kind: "identifier" } });
      if (namespaceName) bindings.namespaces.add(namespaceName.text());
    } else if (!bindings.firstDomNamedImport && imp.find({ rule: { kind: "named_imports" } })) {
      bindings.firstDomNamedImport = imp;
    }
  }

  return bindings;
}

/** Identify a call to a React export (`useState(...)` or `React.useState(...)`). */
function reactHookCall(call: SgNode<TSX>, exportName: string, bindings: ReactBindings): HookCall | null {
  if (call.kind() !== "call_expression") return null;
  const fn = call.field("function");
  if (!fn) return null;

  if (fn.kind() === "identifier") {
    return bindings.named.get(exportName) === fn.text() ? { style: "named", localName: fn.text() } : null;
  }

  if (fn.kind() === "member_expression") {
    const object = fn.field("object");
    const property = fn.field("property");
    if (
      object &&
      property &&
      object.kind() === "identifier" &&
      bindings.namespaces.has(object.text()) &&
      property.text() === exportName
    ) {
      return { style: "member", object: object.text() };
    }
  }

  return null;
}

function isLiteral(node: SgNode<TSX> | null, kind: "true" | "false"): boolean {
  return !!node && node.kind() === kind;
}

/** `const [x, setX] = useState(false);` */
function matchStateStatement(
  stmt: SgNode<TSX>,
  bindings: ReactBindings,
): { stateName: string; setterName: string; hookStyle: HookCall } | null {
  if (stmt.kind() !== "lexical_declaration" && stmt.kind() !== "variable_declaration") return null;
  const declarators = namedChildren(stmt).filter((child) => child.kind() === "variable_declarator");
  const declarator = declarators[0];
  if (declarators.length !== 1 || !declarator) return null;

  const pattern = declarator.field("name");
  const value = declarator.field("value");
  if (!pattern || !value || pattern.kind() !== "array_pattern") return null;
  const elements = namedChildren(pattern);
  const stateNode = elements[0];
  const setterNode = elements[1];
  if (elements.length !== 2 || !stateNode || !setterNode) return null;
  if (stateNode.kind() !== "identifier" || setterNode.kind() !== "identifier") return null;

  const hookStyle = reactHookCall(value, "useState", bindings);
  if (!hookStyle) return null;
  const args = namedChildren(value.field("arguments"));
  if (args.length !== 1 || !isLiteral(args[0] ?? null, "false")) return null;

  return { stateName: stateNode.text(), setterName: setterNode.text(), hookStyle };
}

function isSetterTrueCall(node: SgNode<TSX> | null, setterName: string): boolean {
  if (!node || node.kind() !== "call_expression") return false;
  const fn = node.field("function");
  if (!fn || fn.kind() !== "identifier" || fn.text() !== setterName) return false;
  const args = namedChildren(node.field("arguments"));
  return args.length === 1 && isLiteral(args[0] ?? null, "true");
}

/** `useEffect(() => { setX(true); }, []);` */
function matchEffectStatement(stmt: SgNode<TSX>, setterName: string, bindings: ReactBindings): boolean {
  if (stmt.kind() !== "expression_statement") return false;
  const call = namedChildren(stmt)[0];
  if (!call || call.kind() !== "call_expression") return false;

  const isEffect = [...EFFECT_HOOKS].some((hook) => reactHookCall(call, hook, bindings) !== null);
  if (!isEffect) return false;

  const args = namedChildren(call.field("arguments"));
  const callback = args[0];
  const deps = args[1];
  if (args.length !== 2 || !callback || !deps) return false;
  if (deps.kind() !== "array" || namedChildren(deps).length !== 0) return false;
  if (callback.kind() !== "arrow_function" && callback.kind() !== "function_expression") return false;
  if (namedChildren(callback.field("parameters")).length !== 0) return false;

  const body = callback.field("body");
  if (!body) return false;
  if (body.kind() === "statement_block") {
    const statements = namedChildren(body);
    const only = statements[0];
    if (statements.length !== 1 || !only || only.kind() !== "expression_statement") return false;
    return isSetterTrueCall(namedChildren(only)[0] ?? null, setterName);
  }
  return isSetterTrueCall(body, setterName);
}

function isNegatedState(condition: SgNode<TSX>, stateName: string): boolean {
  let expr: SgNode<TSX> | null = condition;
  while (expr && expr.kind() === "parenthesized_expression") {
    expr = namedChildren(expr)[0] ?? null;
  }
  if (!expr) return false;

  if (expr.kind() === "unary_expression") {
    const argument = expr.field("argument");
    return expr.text().startsWith("!") && !!argument && argument.kind() === "identifier" && argument.text() === stateName;
  }

  if (expr.kind() === "binary_expression") {
    const left = expr.field("left");
    const right = expr.field("right");
    const operator = expr.field("operator")?.text() ?? "";
    if (!left || !right || (operator !== "===" && operator !== "==")) return false;
    return (
      (left.kind() === "identifier" && left.text() === stateName && isLiteral(right, "false")) ||
      (right.kind() === "identifier" && right.text() === stateName && isLiteral(left, "false"))
    );
  }

  return false;
}

/** `if (!x) return <Fallback />;` -> the fallback expression (null for `return null` / bare return). */
function matchGuardStatement(
  stmt: SgNode<TSX>,
  stateName: string,
): { fallback: SgNode<TSX> | null } | null {
  if (stmt.kind() !== "if_statement") return null;
  if (stmt.field("alternative")) return null;
  const condition = stmt.field("condition");
  const consequence = stmt.field("consequence");
  if (!condition || !consequence || !isNegatedState(condition, stateName)) return null;

  let returnStmt: SgNode<TSX> | null = null;
  if (consequence.kind() === "return_statement") {
    returnStmt = consequence;
  } else if (consequence.kind() === "statement_block") {
    const statements = namedChildren(consequence);
    const only = statements[0];
    if (statements.length === 1 && only && only.kind() === "return_statement") returnStmt = only;
  }
  if (!returnStmt) return null;

  let fallback = namedChildren(returnStmt)[0] ?? null;
  while (fallback && fallback.kind() === "parenthesized_expression") {
    fallback = namedChildren(fallback)[0] ?? null;
  }
  if (fallback && (fallback.kind() === "null" || fallback.kind() === "undefined")) fallback = null;
  return { fallback };
}

/** Insert a specifier at the end of a `{ ... }` named-imports list, keeping the existing spacing. */
function appendSpecifierEdit(namedImports: SgNode<TSX>, specifier: string): Edit {
  const text = namedImports.text();
  let insertPos = namedImports.range().end.index - 1;
  let offset = text.length - 1;
  while (offset > 0 && /\s/.test(text[offset - 1] ?? "")) {
    offset--;
    insertPos--;
  }
  const inner = text.slice(1, -1).trim();
  return { startPos: insertPos, endPos: insertPos, insertedText: inner.length > 0 ? `, ${specifier}` : ` ${specifier} ` };
}

function countIdentifiers(scope: SgNode<TSX> | SgNode<TSX, "program">, name: string, exclude: SgNode<TSX>[]): number {
  const excludedRanges = exclude.map((node) => [node.range().start.index, node.range().end.index] as const);
  return scope
    .findAll({
      rule: {
        any: [
          { kind: "identifier", regex: `^${name}$` },
          { kind: "shorthand_property_identifier", regex: `^${name}$` },
        ],
      },
    })
    .filter((node) => {
      const start = node.range().start.index;
      return !excludedRanges.some(([s, e]) => start >= s && start < e);
    }).length;
}

function findMountedPattern(body: SgNode<TSX>, bindings: ReactBindings): MountedPattern | null {
  const statements = namedChildren(body);

  for (let i = 0; i < statements.length; i++) {
    const stateStmt = statements[i];
    if (!stateStmt) continue;
    const state = matchStateStatement(stateStmt, bindings);
    if (!state) continue;

    let effectStmt: SgNode<TSX> | null = null;
    let guardStmt: SgNode<TSX> | null = null;
    let fallback: SgNode<TSX> | null = null;

    for (let j = i + 1; j < statements.length; j++) {
      const candidate = statements[j];
      if (!candidate) continue;
      if (!effectStmt) {
        if (matchEffectStatement(candidate, state.setterName, bindings)) effectStmt = candidate;
        continue;
      }
      const guard = matchGuardStatement(candidate, state.stateName);
      if (guard) {
        guardStmt = candidate;
        fallback = guard.fallback;
        break;
      }
    }
    if (!effectStmt || !guardStmt) continue;

    const own = [stateStmt, effectStmt, guardStmt];
    if (countIdentifiers(body, state.stateName, own) > 0) continue;
    if (countIdentifiers(body, state.setterName, own) > 0) continue;

    return { stateStmt, effectStmt, guardStmt, fallback, ...state };
  }

  return null;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isAsyncFunction(fn: SgNode<TSX>): boolean {
  return fn.children().some((child) => !child.isNamed() && child.text() === "async");
}

/** Walk up to the statement that sits directly in the program. */
function topLevelStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  let current: SgNode<TSX> | null = node;
  while (current) {
    const parent: SgNode<TSX> | null = current.parent();
    if (!parent) return null;
    if (parent.kind() === "program") return current;
    current = parent;
  }
  return null;
}

function findComponents(rootNode: SgNode<TSX, "program">, bindings: ReactBindings): ComponentMatch[] {
  const matches: ComponentMatch[] = [];

  for (const fnNode of rootNode.findAll({ rule: { kind: "function_declaration" } })) {
    const nameNode = fnNode.field("name");
    const body = fnNode.field("body");
    if (!nameNode || !body || !isComponentName(nameNode.text()) || isAsyncFunction(fnNode)) continue;
    const topStmt = topLevelStatement(fnNode);
    if (!topStmt || (topStmt.id() !== fnNode.id() && topStmt.kind() !== "export_statement")) continue;
    if (topStmt.kind() === "export_statement" && fnNode.parent()?.id() !== topStmt.id()) continue;
    const pattern = findMountedPattern(body, bindings);
    if (!pattern) continue;
    matches.push({ fnNode, nameNode, topStmt, declarator: null, pattern });
  }

  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const nameNode = declarator.field("name");
    const fnNode = declarator.field("value");
    if (!nameNode || !fnNode || nameNode.kind() !== "identifier" || !isComponentName(nameNode.text())) continue;
    if (fnNode.kind() !== "arrow_function" && fnNode.kind() !== "function_expression") continue;
    if (isAsyncFunction(fnNode)) continue;
    const body = fnNode.field("body");
    if (!body || body.kind() !== "statement_block") continue;
    const declaration = declarator.parent();
    if (!declaration || (declaration.kind() !== "lexical_declaration" && declaration.kind() !== "variable_declaration")) continue;
    if (namedChildren(declaration).filter((child) => child.kind() === "variable_declarator").length !== 1) continue;
    const topStmt = topLevelStatement(declaration);
    if (!topStmt) continue;
    if (topStmt.id() !== declaration.id() && !(topStmt.kind() === "export_statement" && declaration.parent()?.id() === topStmt.id())) continue;
    const pattern = findMountedPattern(body, bindings);
    if (!pattern) continue;
    matches.push({ fnNode, nameNode, topStmt, declarator, pattern });
  }

  return matches.sort((a, b) => a.fnNode.range().start.index - b.fnNode.range().start.index);
}

function lineIndent(source: string, index: number): string {
  let lineStart = index;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") lineStart--;
  const line = source.slice(lineStart, index);
  return /^[ \t]*$/.test(line) ? line : "";
}

/** Range covering a statement plus its leading indentation and trailing newline. */
function statementLineRange(source: string, node: SgNode<TSX>): [number, number] {
  let start = node.range().start.index;
  let end = node.range().end.index;
  let lineStart = start;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") lineStart--;
  if (/^[ \t]*$/.test(source.slice(lineStart, start))) start = lineStart;
  while (source[end] === " " || source[end] === "\t") end++;
  if (source[end] === "\r") end++;
  if (source[end] === "\n") end++;
  return [start, end];
}

function applyTextEdits(text: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.startPos - a.startPos);
  let result = text;
  for (const edit of sorted) {
    result = result.slice(0, edit.startPos) + edit.insertedText + result.slice(edit.endPos);
  }
  return result;
}

type ParamPlan = {
  wrapperParams: string;
  innerParams: string;
  propsSpread: string;
  paramsNode: SgNode<TSX> | null;
};

function patternBindingNames(pattern: SgNode<TSX>): Set<string> {
  const names = new Set<string>();
  for (const node of pattern.findAll({
    rule: { any: [{ kind: "shorthand_property_identifier_pattern" }, { kind: "identifier" }] },
  })) {
    const parent = node.parent();
    if (parent && parent.kind() === "pair_pattern" && parent.field("key")?.id() === node.id()) continue;
    names.add(node.text());
  }
  return names;
}

function fallbackReferences(fallback: SgNode<TSX> | null, names: Set<string>): boolean {
  if (!fallback || names.size === 0) return false;
  const referenced = fallback.findAll({
    rule: { any: [{ kind: "identifier" }, { kind: "shorthand_property_identifier" }] },
  });
  return referenced.some((node) => names.has(node.text()));
}

function planParams(match: ComponentMatch): ParamPlan | null {
  const fn = match.fnNode;
  const single = fn.field("parameter");
  if (single) {
    if (single.kind() !== "identifier") return null;
    return { wrapperParams: single.text(), innerParams: single.text(), propsSpread: ` {...${single.text()}}`, paramsNode: single };
  }

  const params = fn.field("parameters");
  if (!params) return { wrapperParams: "()", innerParams: "()", propsSpread: "", paramsNode: null };
  const entries = namedChildren(params);
  if (entries.length === 0) return { wrapperParams: params.text(), innerParams: params.text(), propsSpread: "", paramsNode: params };
  const entry = entries[0];
  if (entries.length !== 1 || !entry) return null;
  if (entry.kind() !== "required_parameter" && entry.kind() !== "optional_parameter") return null;

  const parts = namedChildren(entry);
  const pattern = parts[0];
  if (!pattern) return null;
  const typeAnnotation = parts.find((part) => part.kind() === "type_annotation");

  if (pattern.kind() === "identifier") {
    return { wrapperParams: params.text(), innerParams: params.text(), propsSpread: ` {...${pattern.text()}}`, paramsNode: params };
  }

  if (pattern.kind() === "object_pattern") {
    if (fallbackReferences(match.pattern.fallback, patternBindingNames(pattern))) return null;
    return {
      wrapperParams: `(props${typeAnnotation ? typeAnnotation.text() : ""})`,
      innerParams: params.text(),
      propsSpread: " {...props}",
      paramsNode: params,
    };
  }

  return null;
}

function isNameUsed(rootNode: SgNode<TSX, "program">, name: string): boolean {
  return rootNode.find({
    rule: {
      any: [
        { kind: "identifier", regex: `^${name}$` },
        { kind: "type_identifier", regex: `^${name}$` },
        { kind: "shorthand_property_identifier_pattern", regex: `^${name}$` },
      ],
    },
  }) !== null;
}

function rebuildImport(
  importNode: SgNode<TSX>,
  drop: Set<string>,
  add: string[],
  source: string,
): string {
  const quote = quoteOf(importNode);
  const importClause = importNode.find({ rule: { kind: "import_clause" } });
  const defaultIdentifier = importClause?.children().find((child) => child.kind() === "identifier");
  const namespaceImport = importNode.find({ rule: { kind: "namespace_import" } });
  const specifiers = importNode
    .findAll({ rule: { kind: "import_specifier" } })
    .filter((specifier) => !drop.has(specifier.field("name")?.text() ?? ""))
    .map((specifier) => specifier.text());
  const named = [...specifiers, ...add];

  const clauses: string[] = [];
  if (defaultIdentifier) clauses.push(defaultIdentifier.text());
  if (namespaceImport) clauses.push(namespaceImport.text());
  if (named.length > 0) clauses.push(`{ ${named.join(", ")} }`);
  if (clauses.length === 0) return "";
  return `import ${clauses.join(", ")} from ${quote}${source}${quote};`;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const metric = useMetricAtom("use-browser-transformations");

  const bindings = collectReactBindings(rootNode);
  const reactImport = bindings.firstImport;
  if (!reactImport) return null;

  const candidates = findComponents(rootNode, bindings);
  if (candidates.length === 0) return null;

  const edits: Edit[] = [];
  const transformed: ComponentMatch[] = [];
  const usedInnerNames = new Set<string>();

  // Decide how `use`, `Suspense`, and `browser` are referenced.
  const memberObject = candidates.find((match) => match.pattern.hookStyle.style === "member")?.pattern.hookStyle;
  const namedStyle = candidates.some((match) => match.pattern.hookStyle.style === "named");
  const useMember = memberObject && memberObject.style === "member" && !namedStyle ? memberObject.object : null;

  const addToReact: string[] = [];
  let useName: string;
  let suspenseName: string;
  if (useMember) {
    useName = `${useMember}.use`;
    suspenseName = `${useMember}.Suspense`;
  } else {
    const existingUse = bindings.named.get("use");
    const existingSuspense = bindings.named.get("Suspense");
    if (!existingUse && isNameUsed(rootNode, "use")) return null;
    if (!existingSuspense && isNameUsed(rootNode, "Suspense")) return null;
    useName = existingUse ?? "use";
    suspenseName = existingSuspense ?? "Suspense";
    if (!existingSuspense) addToReact.push("Suspense");
    if (!existingUse) addToReact.push("use");
  }

  const existingBrowser = bindings.domNamed.get("browser");
  if (!existingBrowser && isNameUsed(rootNode, "browser")) return null;
  const browserName = existingBrowser ?? "browser";

  for (const match of candidates) {
    const innerName = `${match.nameNode.text()}BrowserOnly`;
    if (usedInnerNames.has(innerName) || isNameUsed(rootNode, innerName)) continue;
    const params = planParams(match);
    if (!params) continue;
    const body = match.fnNode.field("body");
    if (!body) continue;

    const { pattern } = match;
    const indent = lineIndent(source, pattern.stateStmt.range().start.index);
    const baseIndent = lineIndent(source, match.topStmt.range().start.index);
    const fallbackText = pattern.fallback ? pattern.fallback.text() : "null";

    // Wrapper: keep the original name and exports, render the inner component inside Suspense.
    const wrapperBody = [
      "{",
      `${indent}return (`,
      `${indent}  <${suspenseName} fallback={${fallbackText}}>`,
      `${indent}    <${innerName}${params.propsSpread} />`,
      `${indent}  </${suspenseName}>`,
      `${indent});`,
      `${baseIndent}}`,
    ].join("\n");
    if (params.paramsNode && params.wrapperParams !== params.paramsNode.text()) {
      edits.push(params.paramsNode.replace(params.wrapperParams));
    }

    // Inner: the original function with the mounted state swapped for use(browser()).
    const fnStart = match.fnNode.range().start.index;
    const fnText = match.fnNode.text();
    const innerEdits: Edit[] = [];
    const rel = (index: number) => index - fnStart;
    innerEdits.push({
      startPos: rel(pattern.stateStmt.range().start.index),
      endPos: rel(pattern.stateStmt.range().end.index),
      insertedText: `${useName}(${browserName}());`,
    });
    for (const removed of [pattern.effectStmt, pattern.guardStmt]) {
      const [start, end] = statementLineRange(source, removed);
      innerEdits.push({ startPos: rel(start), endPos: rel(end), insertedText: "" });
    }
    if (match.declarator === null) {
      innerEdits.push({
        startPos: rel(match.nameNode.range().start.index),
        endPos: rel(match.nameNode.range().end.index),
        insertedText: innerName,
      });
    }
    let innerText = applyTextEdits(fnText, innerEdits);
    if (match.declarator !== null) {
      const typeAnnotation = match.declarator.field("type");
      innerText = `const ${innerName}${typeAnnotation ? typeAnnotation.text() : ""} = ${innerText};`;
    }

    // Replace the body through the end of the top-level statement in one edit so the
    // inner component lands right after the wrapper without overlapping edits.
    const bodyStart = body.range().start.index;
    const topEnd = match.topStmt.range().end.index;
    const tail = source.slice(body.range().end.index, topEnd);
    edits.push({
      startPos: bodyStart,
      endPos: topEnd,
      insertedText: `${wrapperBody}${tail}\n\n${baseIndent}${innerText}`,
    });

    usedInnerNames.add(innerName);
    transformed.push(match);
  }

  if (transformed.length === 0) return null;

  // Imports: drop hooks that are no longer referenced, add use/Suspense/browser.
  const removedNodes = transformed.flatMap((match) => [match.pattern.stateStmt, match.pattern.effectStmt]);
  const dropFromReact = new Set<string>();
  for (const hook of ["useState", ...EFFECT_HOOKS]) {
    const localName = bindings.named.get(hook);
    if (!localName) continue;
    const remaining = countIdentifiers(rootNode, localName, removedNodes) - 1; // minus the import specifier itself
    if (remaining <= 0) dropFromReact.add(hook);
  }

  const quote = quoteOf(reactImport);
  const browserImport = existingBrowser ? "" : `import { ${browserName} } from ${quote}${REACT_DOM_MODULE}${quote};`;

  let browserImportAdded = existingBrowser !== undefined;
  if (!browserImportAdded && bindings.firstDomNamedImport) {
    const namedImports = bindings.firstDomNamedImport.find({ rule: { kind: "named_imports" } });
    if (namedImports) {
      edits.push(appendSpecifierEdit(namedImports, browserName));
      browserImportAdded = true;
    }
  }

  const reactImportsToClean = rootNode
    .findAll({ rule: { kind: "import_statement" } })
    .filter((imp) => imp.parent()?.kind() === "program" && importSource(imp) === REACT_MODULE && !isTypeOnlyImport(imp));

  for (const imp of reactImportsToClean) {
    const isFirst = imp.id() === reactImport.id();
    const specifierNames = imp
      .findAll({ rule: { kind: "import_specifier" } })
      .map((specifier) => specifier.field("name")?.text() ?? "");
    const needsDrop = specifierNames.some((name) => dropFromReact.has(name));
    const adds = isFirst ? addToReact : [];
    const trailing = isFirst && !browserImportAdded ? browserImport : "";
    if (!needsDrop && adds.length === 0 && trailing === "") continue;

    const rebuilt = rebuildImport(imp, dropFromReact, adds, REACT_MODULE);
    if (rebuilt === "" && trailing === "") {
      const [start, end] = statementLineRange(source, imp);
      edits.push({ startPos: start, endPos: end, insertedText: "" });
    } else {
      const text = [rebuilt, trailing].filter((part) => part !== "").join("\n");
      edits.push(imp.replace(text));
    }
    if (isFirst) browserImportAdded = true;
  }

  metric.increment({ file: metricFile(root.filename()) }, transformed.length);
  return rootNode.commitEdits(edits);
};

export default transform;
