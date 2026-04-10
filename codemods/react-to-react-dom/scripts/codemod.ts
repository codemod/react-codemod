import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

type NamedSpecifier = {
  name: string;
  alias?: string;
};

type ImportBinding = {
  alias: string | null;
  named: NamedSpecifier[];
  statements: SgNode<TSX>[];
  quote: string;
};

type RequireBinding = {
  alias: string;
  statement: SgNode<TSX>;
  kind: "var" | "let" | "const";
};

type AssignmentBinding = {
  alias: string;
  declaration: SgNode<TSX> | null;
  assignment: SgNode<TSX>;
  kind: "var" | "let" | "const";
};

type ModulePair = {
  core: string;
  dom: string;
  server: string;
  domAlias: string;
  serverAlias: string;
};

type MemberAnalysis = {
  edits: Edit[];
  domUses: number;
  serverUses: number;
  coreUses: number;
};

type DestructureAnalysis = {
  edits: Edit[];
  domUses: number;
  coreUses: number;
};

const CORE_PROPERTIES = [
  "Children",
  "Component",
  "createElement",
  "cloneElement",
  "isValidElement",
  "PropTypes",
  "createClass",
  "createFactory",
  "createMixin",
  "DOM",
  "__spread",
] as const;

const DOM_PROPERTIES = [
  "findDOMNode",
  "render",
  "unmountComponentAtNode",
  "unstable_batchedUpdates",
  "unstable_renderSubtreeIntoContainer",
] as const;

const DOM_SERVER_PROPERTIES = [
  "renderToString",
  "renderToStaticMarkup",
] as const;

const CORE_SET = new Set<string>(CORE_PROPERTIES);
const DOM_SET = new Set<string>(DOM_PROPERTIES);
const DOM_SERVER_SET = new Set<string>(DOM_SERVER_PROPERTIES);

const MODULE_PAIRS: ModulePair[] = [
  {
    core: "React",
    dom: "ReactDOM",
    server: "ReactDOMServer",
    domAlias: "ReactDOM",
    serverAlias: "ReactDOMServer",
  },
  {
    core: "react",
    dom: "react-dom",
    server: "react-dom/server",
    domAlias: "ReactDOM",
    serverAlias: "ReactDOMServer",
  },
];

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

function exactRule(kind: "identifier" | "type_identifier" | "property_identifier", name: string) {
  return {
    kind,
    regex: `^${name}$`,
  } as const;
}

function statementRange(node: SgNode<TSX>, source: string): { start: number; end: number } {
  const range = node.range();
  let end = range.end.index;
  while (end < source.length && (source[end] === "\n" || source[end] === "\r")) {
    end++;
  }
  return { start: range.start.index, end };
}

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) {
    return fragment.text();
  }

  const text = node.text();
  if (text.length >= 2) {
    return text.slice(1, -1);
  }

  return null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function quoteForImport(node: SgNode<TSX>): string {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  const text = source?.text() ?? "'react'";
  return text.startsWith("\"") ? "\"" : "'";
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  return namedChildren(call.field("arguments"));
}

function isRequireOf(node: SgNode<TSX> | null, moduleName: string): boolean {
  if (!node || node.kind() !== "call_expression") {
    return false;
  }

  const callee = node.field("function");
  const firstArg = callArguments(node)[0];
  return callee?.kind() === "identifier" &&
    callee.text() === "require" &&
    firstArg?.kind() === "string" &&
    sourceText(firstArg) === moduleName;
}

function declarationKind(statement: SgNode<TSX>): "var" | "let" | "const" {
  const text = statement.text();
  if (text.startsWith("const ")) return "const";
  if (text.startsWith("let ")) return "let";
  return "var";
}

function buildImportLine(
  quote: string,
  source: string,
  defaultAlias: string | null,
  named: NamedSpecifier[],
): string {
  const parts: string[] = [];
  if (defaultAlias) {
    parts.push(defaultAlias);
  }
  if (named.length > 0) {
    const rendered = named.map((spec) =>
      spec.alias && spec.alias !== spec.name ? `${spec.name} as ${spec.alias}` : spec.name
    );
    parts.push(`{ ${rendered.join(", ")} }`);
  }
  return `import ${parts.join(", ")} from ${quote}${source}${quote};`;
}

function buildRequireLine(kind: "var" | "let" | "const", alias: string, source: string): string {
  return `${kind} ${alias} = require('${source}');`;
}

function buildRequireDeclaration(kind: "var" | "let" | "const", alias: string): string {
  return `${kind} ${alias};`;
}

function buildRequireAssignment(alias: string, source: string): string {
  return `${alias} = require('${source}');`;
}

function uniqueSpecs(specs: NamedSpecifier[]): NamedSpecifier[] {
  const seen = new Set<string>();
  const result: NamedSpecifier[] = [];
  for (const spec of specs) {
    const key = `${spec.name}:${spec.alias ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(spec);
    }
  }
  return result;
}

function sortSpecs(specs: NamedSpecifier[]): NamedSpecifier[] {
  return [...specs].sort((left, right) => left.name.localeCompare(right.name));
}

function findModuleImports(rootNode: SgNode<TSX>, moduleName: string): ImportBinding {
  const statements = rootNode.findAll({ rule: { kind: "import_statement" } })
    .filter((stmt) => importSource(stmt) === moduleName);

  const named: NamedSpecifier[] = [];
  let alias: string | null = null;
  let quote = "'";

  for (const stmt of statements) {
    quote = quoteForImport(stmt);
    const clause = stmt.find({ rule: { kind: "import_clause" } });
    if (!clause) {
      continue;
    }

    const defaultIdentifier = namedChildren(clause)
      .find((child) => child.kind() === "identifier");
    if (defaultIdentifier) {
      alias = defaultIdentifier.text();
    }

    for (const spec of stmt.findAll({ rule: { kind: "import_specifier" } })) {
      named.push({
        name: spec.field("name")?.text() ?? spec.text(),
        alias: spec.field("alias")?.text() ?? undefined,
      });
    }
  }

  return {
    alias,
    named: uniqueSpecs(named),
    statements,
    quote,
  };
}

function findRequireBinding(rootNode: SgNode<TSX>, moduleName: string): RequireBinding | null {
  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name?.kind() !== "identifier" || !isRequireOf(value, moduleName)) {
      continue;
    }

    const statement = declarator.ancestors().find((ancestor) =>
      ancestor.kind() === "variable_declaration" || ancestor.kind() === "lexical_declaration"
    );
    if (!statement) {
      continue;
    }

    return {
      alias: name.text(),
      statement,
      kind: declarationKind(statement),
    };
  }

  return null;
}

function findAssignmentBinding(rootNode: SgNode<TSX>, moduleName: string): AssignmentBinding | null {
  for (const assignment of rootNode.findAll({ rule: { kind: "assignment_expression" } })) {
    const left = assignment.field("left");
    const right = assignment.field("right");
    if (left?.kind() !== "identifier" || !isRequireOf(right, moduleName)) {
      continue;
    }

    const assignmentStatement = assignment.ancestors().find((ancestor) => ancestor.kind() === "expression_statement");
    if (!assignmentStatement) {
      continue;
    }

    const alias = left.text();
    const bareDeclaration = rootNode.findAll({ rule: { kind: "variable_declarator" } })
      .find((declarator) => declarator.field("name")?.text() === alias && !declarator.field("value"));
    const declaration = bareDeclaration?.ancestors().find((ancestor) =>
      ancestor.kind() === "variable_declaration" || ancestor.kind() === "lexical_declaration"
    ) ?? null;

    return {
      alias,
      declaration,
      assignment: assignmentStatement,
      kind: declaration ? declarationKind(declaration) : "var",
    };
  }

  return null;
}

function hasCoreSource(rootNode: SgNode<TSX>, moduleName: string): boolean {
  return findModuleImports(rootNode, moduleName).statements.length > 0 ||
    findRequireBinding(rootNode, moduleName) !== null ||
    findAssignmentBinding(rootNode, moduleName) !== null;
}

function activePair(rootNode: SgNode<TSX>): ModulePair | null {
  for (const pair of MODULE_PAIRS) {
    if (hasCoreSource(rootNode, pair.core)) {
      return pair;
    }
  }

  return null;
}

function hasJSX(rootNode: SgNode<TSX>): boolean {
  return rootNode.findAll({
    rule: {
      any: [
        { kind: "jsx_element" },
        { kind: "jsx_self_closing_element" },
      ],
    },
  }).length > 0;
}

function isImportContext(node: SgNode<TSX>): boolean {
  return node.ancestors().some((ancestor) => ancestor.kind() === "import_statement");
}

function memberPropertyName(node: SgNode<TSX>): string | null {
  if (node.kind() === "member_expression") {
    return node.field("property")?.text() ?? null;
  }

  if (node.kind() === "nested_type_identifier") {
    const children = namedChildren(node);
    return children[1]?.text() ?? null;
  }

  return null;
}

function memberObjectNode(node: SgNode<TSX>): SgNode<TSX> | null {
  if (node.kind() === "member_expression") {
    return node.field("object");
  }

  if (node.kind() === "nested_type_identifier") {
    return namedChildren(node)[0] ?? null;
  }

  return null;
}

function isIdentifierNode(node: SgNode<TSX> | null, name: string): boolean {
  return node?.kind() === "identifier" && node.text() === name;
}

function classifyProperty(name: string): "core" | "dom" | "server" | "unknown" {
  if (CORE_SET.has(name)) return "core";
  if (DOM_SET.has(name)) return "dom";
  if (DOM_SERVER_SET.has(name)) return "server";
  return "unknown";
}

function analyzeReactMembers(
  rootNode: SgNode<TSX>,
  reactAlias: string,
  domAlias: string,
  serverAlias: string,
): MemberAnalysis {
  const edits: Edit[] = [];
  let domUses = 0;
  let serverUses = 0;
  let coreUses = 0;

  const nodes = rootNode.findAll({
    rule: {
      any: [
        { kind: "member_expression" },
        { kind: "nested_type_identifier" },
      ],
    },
  });

  for (const node of nodes) {
    if (node.kind() === "member_expression" && isImportContext(node)) {
      continue;
    }

    const object = memberObjectNode(node);
    const propertyName = memberPropertyName(node);
    if (!isIdentifierNode(object, reactAlias) || !propertyName) {
      continue;
    }

    const category = classifyProperty(propertyName);
    if (category === "unknown") {
      throw new Error(`Unknown property React.${propertyName}`);
    }

    if (category === "core") {
      coreUses++;
      continue;
    }

    edits.push(object.replace(category === "dom" ? domAlias : serverAlias));
    if (category === "dom") {
      domUses++;
    } else {
      serverUses++;
    }
  }

  return { edits, domUses, serverUses, coreUses };
}

function destructuredNames(pattern: SgNode<TSX>): string[] {
  return pattern.findAll({
    rule: {
      any: [
        { kind: "shorthand_property_identifier_pattern" },
        { kind: "pair_pattern" },
      ],
    },
  }).map((property) => {
    if (property.kind() === "shorthand_property_identifier_pattern") {
      return property.text();
    }
    return property.field("key")?.text() ?? property.text();
  });
}

function analyzeReactDestructures(
  rootNode: SgNode<TSX>,
  reactAlias: string,
  domAlias: string,
): DestructureAnalysis {
  const edits: Edit[] = [];
  let domUses = 0;
  let coreUses = 0;

  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const pattern = declarator.field("name");
    const value = declarator.field("value");
    if (pattern?.kind() !== "object_pattern" || !isIdentifierNode(value, reactAlias)) {
      continue;
    }

    const core: string[] = [];
    const dom: string[] = [];

    for (const name of destructuredNames(pattern)) {
      const category = classifyProperty(name);
      if (category === "unknown" || category === "server") {
        throw new Error(`Unknown property React.${name} while destructuring`);
      }
      if (category === "core") {
        core.push(name);
      } else {
        dom.push(name);
      }
    }

    if (dom.length === 0) {
      coreUses++;
      continue;
    }

    if (core.length === 0) {
      edits.push(value.replace(domAlias));
      domUses++;
      continue;
    }

    const statement = declarator.ancestors().find((ancestor) =>
      ancestor.kind() === "variable_declaration" || ancestor.kind() === "lexical_declaration"
    );
    if (!statement) {
      continue;
    }

    const declarators = namedChildren(statement).filter((child) => child.kind() === "variable_declarator");
    if (declarators.length !== 1) {
      throw new Error("Mixed React destructuring with multiple declarators is unsupported");
    }

    const kind = declarationKind(statement);
    edits.push(statement.replace(
      `${kind} { ${core.join(", ")} } = ${reactAlias};\n${kind} { ${dom.join(", ")} } = ${domAlias};`,
    ));
    domUses++;
    coreUses++;
  }

  return { edits, domUses, coreUses };
}

function namedFromReact(binding: ImportBinding, names: readonly string[]): NamedSpecifier[] {
  const wanted = new Set(names);
  return binding.named.filter((spec) => wanted.has(spec.name));
}

function withoutNamed(binding: ImportBinding, names: readonly string[]): NamedSpecifier[] {
  const removed = new Set(names);
  return binding.named.filter((spec) => !removed.has(spec.name));
}

function hasIdentifierReference(rootNode: SgNode<TSX>, name: string): boolean {
  return rootNode.findAll({
    rule: {
      any: [
        exactRule("identifier", name),
        exactRule("type_identifier", name),
        exactRule("property_identifier", name),
      ],
    },
  }).length > 0;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const metric = useMetricAtom("react-to-react-dom-migrations");
  const edits: Edit[] = [];

  const pair = activePair(rootNode);
  if (!pair) {
    return null;
  }

  const reactImport = findModuleImports(rootNode, pair.core);
  const reactDomImport = findModuleImports(rootNode, pair.dom);
  const reactDomServerImport = findModuleImports(rootNode, pair.server);
  const reactRequire = findRequireBinding(rootNode, pair.core);
  const reactAssign = findAssignmentBinding(rootNode, pair.core);
  const reactDomRequire = findRequireBinding(rootNode, pair.dom);
  const reactDomServerRequire = findRequireBinding(rootNode, pair.server);

  const coreDeclarationCount = reactImport.statements.length + (reactRequire ? 1 : 0) + (reactAssign ? 1 : 0);
  if (coreDeclarationCount === 0) {
    return null;
  }
  if (coreDeclarationCount > 1) {
    throw new Error("Multiple declarations of React");
  }

  const reactAlias = reactImport.alias ?? reactRequire?.alias ?? reactAssign?.alias ?? null;
  const domAlias = reactDomImport.alias ?? reactDomRequire?.alias ?? pair.domAlias;
  const serverAlias = reactDomServerImport.alias ?? reactDomServerRequire?.alias ?? pair.serverAlias;

  const memberAnalysis = reactAlias
    ? analyzeReactMembers(rootNode, reactAlias, domAlias, serverAlias)
    : { edits: [], domUses: 0, serverUses: 0, coreUses: 0 };
  const destructureAnalysis = reactAlias
    ? analyzeReactDestructures(rootNode, reactAlias, domAlias)
    : { edits: [], domUses: 0, coreUses: 0 };

  const domNamedFromReact = namedFromReact(reactImport, DOM_PROPERTIES);
  const serverNamedFromReact = namedFromReact(reactImport, DOM_SERVER_PROPERTIES);
  const coreNamedFromReact = withoutNamed(reactImport, [...DOM_PROPERTIES, ...DOM_SERVER_PROPERTIES]);

  const needsDomBinding =
    memberAnalysis.domUses > 0 ||
    destructureAnalysis.domUses > 0 ||
    domNamedFromReact.length > 0 ||
    reactDomImport.statements.length > 0;
  const needsServerBinding =
    memberAnalysis.serverUses > 0 ||
    serverNamedFromReact.length > 0 ||
    reactDomServerImport.statements.length > 0;

  if (needsDomBinding && !reactDomImport.alias && !reactDomRequire && hasIdentifierReference(rootNode, domAlias)) {
    throw new Error("ReactDOM is already defined in a different scope than React");
  }
  if (needsServerBinding && !reactDomServerImport.alias && !reactDomServerRequire && hasIdentifierReference(rootNode, serverAlias)) {
    throw new Error("ReactDOMServer is already defined in a different scope than React");
  }

  edits.push(...memberAnalysis.edits, ...destructureAnalysis.edits);

  if (reactImport.statements.length > 0) {
    const quote = reactImport.quote;
    const keepReactDefault = reactImport.alias !== null && (
      hasJSX(rootNode) ||
      memberAnalysis.coreUses > 0 ||
      destructureAnalysis.coreUses > 0
    );

    const nextReactNamed = sortSpecs(coreNamedFromReact);
    const nextDomNamed = sortSpecs(uniqueSpecs([...reactDomImport.named, ...domNamedFromReact]));
    const nextServerNamed = sortSpecs(uniqueSpecs([...reactDomServerImport.named, ...serverNamedFromReact]));

    const lines: string[] = [];
    if (keepReactDefault || nextReactNamed.length > 0) {
      lines.push(buildImportLine(quote, pair.core, keepReactDefault ? reactImport.alias : null, nextReactNamed));
    }
    if (!reactDomRequire && needsDomBinding) {
      const defaultAlias = reactDomImport.alias ?? (memberAnalysis.domUses > 0 || destructureAnalysis.domUses > 0 ? domAlias : null);
      lines.push(buildImportLine(quote, pair.dom, defaultAlias, nextDomNamed));
    }
    if (!reactDomServerRequire && needsServerBinding) {
      const defaultAlias = reactDomServerImport.alias ?? (memberAnalysis.serverUses > 0 ? serverAlias : null);
      lines.push(buildImportLine(quote, pair.server, defaultAlias, nextServerNamed));
    }

    const allImportStatements = [
      ...reactImport.statements,
      ...reactDomImport.statements,
      ...reactDomServerImport.statements,
    ];
    const ranges = allImportStatements.map((stmt) => statementRange(stmt, source));
    const start = Math.min(...ranges.map((range) => range.start));
    const end = Math.max(...ranges.map((range) => range.end));
    edits.push({
      startPos: start,
      endPos: end,
      insertedText: lines.length > 0 ? `${lines.join("\n")}\n\n` : "",
    });
  }

  if (reactRequire) {
    const keepReact = hasJSX(rootNode) || memberAnalysis.coreUses > 0 || destructureAnalysis.coreUses > 0;
    const inserted: string[] = [];
    if (!reactDomRequire && (memberAnalysis.domUses > 0 || destructureAnalysis.domUses > 0)) {
      inserted.push(buildRequireLine(reactRequire.kind, domAlias, pair.dom));
    }
    if (!reactDomServerRequire && memberAnalysis.serverUses > 0) {
      inserted.push(buildRequireLine(reactRequire.kind, serverAlias, pair.server));
    }

    const range = statementRange(reactRequire.statement, source);
    if (keepReact) {
      if (inserted.length > 0) {
        edits.push({
          startPos: range.start,
          endPos: range.end,
          insertedText: `${reactRequire.statement.text()}\n\n${inserted.join("\n")}\n\n`,
        });
      }
    } else {
      edits.push({
        startPos: range.start,
        endPos: range.end,
        insertedText: inserted.length > 0 ? `${inserted.join("\n")}\n` : "",
      });
    }
  }

  if (reactAssign) {
    const declarationLines: string[] = [];
    const assignmentLines: string[] = [];

    if (!reactDomRequire && (memberAnalysis.domUses > 0 || destructureAnalysis.domUses > 0)) {
      declarationLines.push(buildRequireDeclaration(reactAssign.kind, domAlias));
      assignmentLines.push(buildRequireAssignment(domAlias, pair.dom));
    }
    if (!reactDomServerRequire && memberAnalysis.serverUses > 0) {
      declarationLines.push(buildRequireDeclaration(reactAssign.kind, serverAlias));
      assignmentLines.push(buildRequireAssignment(serverAlias, pair.server));
    }

    if (declarationLines.length > 0 && reactAssign.declaration) {
      const declRange = statementRange(reactAssign.declaration, source);
      edits.push({
        startPos: declRange.start,
        endPos: declRange.end,
        insertedText: `${reactAssign.declaration.text()}\n\n${declarationLines.join("\n")}\n\n`,
      });
    }
    if (assignmentLines.length > 0) {
      const assignRange = statementRange(reactAssign.assignment, source);
      edits.push({
        startPos: assignRange.start,
        endPos: assignRange.end,
        insertedText: `${reactAssign.assignment.text()}\n${assignmentLines.join("\n")}\n`,
      });
    }
  }

  if (edits.length === 0) {
    return null;
  }

  metric.increment({
    domMembers: String(memberAnalysis.domUses + destructureAnalysis.domUses + domNamedFromReact.length),
    serverMembers: String(memberAnalysis.serverUses + serverNamedFromReact.length),
    file: metricFile(root.filename()),
  });

  return rootNode.commitEdits(edits);
};

export default transform;
