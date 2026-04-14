import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import * as fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

type ReactImportAliases = {
  component: Set<string>;
  pureComponent: Set<string>;
};

type ReactSuperclassKind = "Component" | "PureComponent";

const REACT_SOURCES = new Set(["react", "React", "react/addons", "react-native"]);

function stringValue(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function callArguments(call: SgNode<TSX>): SgNode<TSX>[] {
  const args = call.field("arguments");
  if (!args) return [];
  return args.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

function requireSource(call: SgNode<TSX>): string | null {
  const callee = call.field("function");
  if (!callee || callee.kind() !== "identifier" || callee.text() !== "require") return null;
  const firstArg = callArguments(call)[0];
  return firstArg?.kind() === "string" ? stringValue(firstArg) : null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? stringValue(source) : null;
}

function isReactSource(importStmt: SgNode<TSX>): boolean {
  return REACT_SOURCES.has(importSource(importStmt) ?? "");
}

function hasReact(rootNode: SgNode<TSX, "program">): boolean {
  for (const importNode of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (isReactSource(importNode)) return true;
  }

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    if (REACT_SOURCES.has(requireSource(call) ?? "")) return true;
  }

  return false;
}

function explicitRequireDisabled(value: unknown): boolean {
  return value === false || value === "false";
}

function reactImportAliases(rootNode: SgNode<TSX>): ReactImportAliases {
  const component = new Set<string>();
  const pureComponent = new Set<string>();

  for (const importStmt of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (!isReactSource(importStmt)) continue;

    for (const specifier of importStmt.findAll({ rule: { kind: "import_specifier" } })) {
      const imported = specifier.field("name")?.text();
      const alias = specifier.field("alias")?.text() ?? imported;
      if (!imported || !alias) continue;
      if (imported === "Component") component.add(alias);
      if (imported === "PureComponent") pureComponent.add(alias);
    }
  }

  return { component, pureComponent };
}

function reactSuperclassKind(
  classDecl: SgNode<TSX>,
  aliases: ReactImportAliases,
): ReactSuperclassKind | null {
  const heritage = classDecl.find({ rule: { kind: "class_heritage" } });
  if (!heritage) return null;

  const directExtends = heritage.find({
    rule: { any: [{ kind: "member_expression" }, { kind: "identifier" }] },
  });
  if (!directExtends) return null;

  if (directExtends.kind() === "member_expression") {
    const object = directExtends.field("object");
    const property = directExtends.field("property")?.text() ?? "";
    if (object?.text() !== "React") return null;
    if (property === "Component" || property === "PureComponent") return property;
    return null;
  }

  const name = directExtends.text();
  if (aliases.component.has(name)) return "Component";
  if (aliases.pureComponent.has(name)) return "PureComponent";
  return null;
}

function isReactCreateClassCall(node: SgNode<TSX> | null): node is SgNode<TSX> {
  if (!node || node.kind() !== "call_expression") return false;
  const callee = node.field("function");
  return callee?.kind() === "member_expression" &&
    callee.field("object")?.kind() === "identifier" &&
    callee.field("object")?.text() === "React" &&
    callee.field("property")?.kind() === "property_identifier" &&
    callee.field("property")?.text() === "createClass";
}

function reactCreateClassConfigs(rootNode: SgNode<TSX, "program">): SgNode<TSX>[] {
  const configs: SgNode<TSX>[] = [];
  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const value = declarator.field("value");
    if (!isReactCreateClassCall(value)) continue;
    const args = value.field("arguments");
    const config = args?.children().find((child) => child.kind() === "object");
    if (config) configs.push(config);
  }
  return configs;
}

function reactClassBodies(rootNode: SgNode<TSX, "program">): SgNode<TSX>[] {
  const aliases = reactImportAliases(rootNode);
  const reactClasses = rootNode.findAll({ rule: { kind: "class_declaration" } })
    .map((classDecl) => ({ classDecl, kind: reactSuperclassKind(classDecl, aliases) }))
    .filter((entry): entry is { classDecl: SgNode<TSX>; kind: ReactSuperclassKind } => entry.kind !== null);
  const targetSuperclassKind = reactClasses.some((entry) => entry.kind === "Component")
    ? "Component"
    : reactClasses.some((entry) => entry.kind === "PureComponent")
      ? "PureComponent"
      : null;

  if (!targetSuperclassKind) return [];
  return reactClasses
    .filter((entry) => entry.kind === targetSuperclassKind)
    .map((entry) => entry.classDecl.find({ rule: { kind: "class_body" } }))
    .filter((body): body is SgNode<TSX> => body !== null);
}


type MemberChunk = {
  node: SgNode<TSX>;
  name: string;
  text: string;
  start: number;
  end: number;
  originalIndex: number;
};

const DEFAULT_METHODS_ORDER = [
  "static-methods",
  "displayName",
  "propTypes",
  "contextTypes",
  "childContextTypes",
  "mixins",
  "statics",
  "defaultProps",
  "constructor",
  "getDefaultProps",
  "state",
  "getInitialState",
  "getChildContext",
  "getDerivedStateFromProps",
  "componentWillMount",
  "UNSAFE_componentWillMount",
  "componentDidMount",
  "componentWillReceiveProps",
  "UNSAFE_componentWillReceiveProps",
  "shouldComponentUpdate",
  "componentWillUpdate",
  "UNSAFE_componentWillUpdate",
  "getSnapshotBeforeUpdate",
  "componentDidUpdate",
  "componentDidCatch",
  "componentWillUnmount",
  "/^on.+$/",
  "/^(get|set)(?!(InitialState$|DefaultProps$|ChildContext$)).+$/",
  "everything-else",
  "/^render.+$/",
  "render",
];

type SortCompRuleConfig = {
  order?: string[];
  groups?: Record<string, string[]>;
};

const ESLINT_CONFIG_FILES = [
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  "package.json",
];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function stringArrayParam(value: unknown): string[] | null {
  if (isStringArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isStringArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isGroupsMap(value: unknown): value is Record<string, string[]> {
  return typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => isStringArray(entry));
}

function normalizeSortCompRuleConfig(value: unknown): SortCompRuleConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const maybeConfig = value as { order?: unknown; groups?: unknown };
  const config: SortCompRuleConfig = {};
  if (maybeConfig.order !== undefined) {
    if (!isStringArray(maybeConfig.order)) return null;
    config.order = maybeConfig.order;
  }
  if (maybeConfig.groups !== undefined) {
    if (!isGroupsMap(maybeConfig.groups)) return null;
    config.groups = maybeConfig.groups;
  }
  return config;
}

async function getMethodsOrderFromEslint(filePath: string): Promise<string[] | null> {
  let dir = path.dirname(filePath);
  while (true) {
    for (const configName of ESLINT_CONFIG_FILES) {
      const configPath = path.join(dir, configName);
      const methodsOrder = await methodsOrderFromConfigFile(configPath, new Set<string>());
      if (methodsOrder) return methodsOrder;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveMethodsOrder(ruleConfig: SortCompRuleConfig): string[] | null {
  if (!ruleConfig.order) return null;
  const groups = ruleConfig.groups ?? {};
  const resolvedOrder: string[] = [];
  for (const entry of ruleConfig.order) {
    const groupEntries = groups[entry];
    if (groupEntries) {
      resolvedOrder.push(...groupEntries);
    } else {
      resolvedOrder.push(entry);
    }
  }
  return resolvedOrder;
}

function yamlRuleConfig(text: string): SortCompRuleConfig | null {
  const lines = text.split("\n");
  const sortCompIndex = lines.findIndex((line) => line.trim() === "react/sort-comp:");
  if (sortCompIndex === -1) return null;

  const ruleConfig: SortCompRuleConfig = {};
  let mode: "order" | "groups" | "group-items" | null = null;
  let currentGroup: string | null = null;

  for (let i = sortCompIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (indent <= 2) break;
    if (trimmed === "- 0" || trimmed === "- off" || trimmed === "- warn" || trimmed === "- error") continue;

    if (trimmed === "- order:" || trimmed === "order:") {
      ruleConfig.order = [];
      mode = "order";
      currentGroup = null;
      continue;
    }

    if (trimmed === "groups:" || trimmed === "- groups:") {
      ruleConfig.groups = {};
      mode = "groups";
      currentGroup = null;
      continue;
    }

    if (mode === "order" && trimmed.startsWith("- ")) {
      ruleConfig.order?.push(trimmed.slice(2));
      continue;
    }

    if ((mode === "groups" || mode === "group-items") && trimmed.endsWith(":") && !trimmed.startsWith("- ")) {
      currentGroup = trimmed.slice(0, -1);
      ruleConfig.groups ??= {};
      ruleConfig.groups[currentGroup] = [];
      mode = "group-items";
      continue;
    }

    if (mode === "group-items" && currentGroup && trimmed.startsWith("- ")) {
      ruleConfig.groups?.[currentGroup]?.push(trimmed.slice(2));
      continue;
    }
  }

  return ruleConfig.order ? ruleConfig : null;
}

async function loadConfigFile(configPath: string): Promise<unknown | null> {
  const basename = path.basename(configPath);
  if (basename === "package.json") {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as { eslintConfig?: unknown };
      return parsed.eslintConfig ?? null;
    } catch {
      return null;
    }
  }

  if (configPath.endsWith(".js") || configPath.endsWith(".cjs") || configPath.endsWith(".mjs")) {
    try {
      const imported = await import(pathToFileURL(configPath).href);
      return ("default" in imported ? imported.default : imported) as unknown;
    } catch {
      return null;
    }
  }

  let text: string;
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch {
    return null;
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  return { rules: { "react/sort-comp": [0, yamlRuleConfig(text)] } };
}

function directRuleConfig(config: unknown): SortCompRuleConfig | null {
  if (typeof config !== "object" || config === null) return null;
  const maybeRules = (config as { rules?: unknown }).rules;
  if (typeof maybeRules !== "object" || maybeRules === null) return null;
  const sortCompRule = (maybeRules as Record<string, unknown>)["react/sort-comp"];
  if (!Array.isArray(sortCompRule) || sortCompRule.length < 2) return null;
  return normalizeSortCompRuleConfig(sortCompRule[1]);
}

function normalizeExtends(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return isStringArray(value) ? value : [];
}

function resolveRelativeExtend(baseDir: string, specifier: string): string | null {
  if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) return null;
  const candidates = [
    specifier,
    `${specifier}.js`,
    `${specifier}.cjs`,
    `${specifier}.mjs`,
    `${specifier}.json`,
    `${specifier}.yaml`,
    `${specifier}.yml`,
  ].map((candidate) => path.resolve(baseDir, candidate));
  for (const candidate of candidates) {
    try {
      fs.readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function tryReadText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function resolvePackageExtend(baseDir: string, specifier: string): string | null {
  if (specifier.startsWith(".") || path.isAbsolute(specifier) || specifier.startsWith("eslint:") || specifier.startsWith("plugin:")) {
    return null;
  }

  const parts = specifier.split("/");
  const isScoped = specifier.startsWith("@");
  const packagePartLength = isScoped ? 2 : 1;
  const packageName = parts.slice(0, packagePartLength).join("/");
  const subpath = parts.slice(packagePartLength).join("/");
  const packageCandidates = (() => {
    if (isScoped) {
      const [scope, name] = packageName.split("/");
      return name.startsWith("eslint-config-")
        ? [packageName]
        : [packageName, `${scope}/eslint-config-${name}`];
    }
    return packageName.startsWith("eslint-config-")
      ? [packageName]
      : [packageName, `eslint-config-${packageName}`];
  })();

  let dir = baseDir;
  while (true) {
    for (const packageCandidate of packageCandidates) {
      const packageRoot = path.join(dir, "node_modules", packageCandidate);
      const directCandidate = subpath
        ? resolveRelativeExtend(packageRoot, subpath)
        : null;
      if (directCandidate) return directCandidate;

      const packageJsonPath = path.join(packageRoot, "package.json");
      const packageJsonText = tryReadText(packageJsonPath);
      if (packageJsonText) {
        try {
          const pkg = JSON.parse(packageJsonText) as { main?: string };
          const mainField = typeof pkg.main === "string" ? pkg.main : "index.js";
          const mainCandidate = resolveRelativeExtend(packageRoot, mainField);
          if (mainCandidate) return mainCandidate;
        } catch {
          // ignore malformed package json
        }
      }

      const indexCandidate = resolveRelativeExtend(packageRoot, "index");
      if (indexCandidate) return indexCandidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function methodsOrderFromConfigFile(
  configPath: string,
  seen: Set<string>,
): Promise<string[] | null> {
  if (seen.has(configPath)) return null;
  seen.add(configPath);

  const config = await loadConfigFile(configPath);
  const direct = directRuleConfig(config);
  const resolvedDirect = direct ? resolveMethodsOrder(direct) : null;
  if (resolvedDirect) return resolvedDirect;

  if (typeof config !== "object" || config === null) return null;
  const extendsEntries = normalizeExtends((config as { extends?: unknown }).extends);
  for (const entry of extendsEntries) {
    const resolvedPath = resolveRelativeExtend(path.dirname(configPath), entry) ??
      resolvePackageExtend(path.dirname(configPath), entry);
    if (!resolvedPath) continue;
    const resolvedOrder = await methodsOrderFromConfigFile(resolvedPath, seen);
    if (resolvedOrder) return resolvedOrder;
  }

  return null;
}

function isTypeAnnotationMember(node: SgNode<TSX>): boolean {
  return node.kind() === "public_field_definition" &&
    node.field("value") === null &&
    node.find({ rule: { kind: "type_annotation" } }) !== null;
}

function selectorMatches(selector: string, name: string, isStatic: boolean): boolean {
  if (selector === "static-methods") return isStatic;
  if (selector === "type-annotations") return false;
  if (selector === name) return true;
  if (selector.startsWith("/") && selector.lastIndexOf("/") > 0) {
    const lastSlash = selector.lastIndexOf("/");
    const body = selector.slice(1, lastSlash);
    const flags = selector.slice(lastSlash + 1);
    try {
      return new RegExp(body, flags).test(name);
    } catch {
      return false;
    }
  }
  return false;
}

function chunkMatchesSelector(selector: string, chunk: MemberChunk): boolean {
  if (selector === "type-annotations") return isTypeAnnotationMember(chunk.node);
  return selectorMatches(selector, chunk.name, chunk.node.text().startsWith("static "));
}

function correctIndex(order: string[], chunk: MemberChunk): number {
  const everythingElse = order.indexOf("everything-else");
  for (let i = 0; i < order.length; i++) {
    if (i !== everythingElse && chunkMatchesSelector(order[i]!, chunk)) return i;
  }
  return everythingElse >= 0 ? everythingElse : Number.POSITIVE_INFINITY;
}

function memberName(node: SgNode<TSX>): string {
  const fieldName = node.field("name")?.text() ?? node.field("key")?.text();
  if (fieldName) return fieldName;
  return node.children().find((child) =>
    child.kind() === "property_identifier" || child.kind() === "identifier"
  )?.text() ?? "";
}

function significantChildren(container: SgNode<TSX>): SgNode<TSX>[] {
  return container.children()
    .filter((child) =>
      child.kind() === "comment" ||
      child.kind() === "pair" ||
      child.kind() === "method_definition" ||
      child.kind() === "public_field_definition"
    )
    .sort((a, b) => a.range().start.index - b.range().start.index);
}

function collectChunks(container: SgNode<TSX>, source: string): MemberChunk[] {
  const chunks: MemberChunk[] = [];
  let leadingStart: number | null = null;

  for (const child of significantChildren(container)) {
    if (child.kind() === "comment") {
      if (leadingStart === null) leadingStart = child.range().start.index;
      continue;
    }
    const start = leadingStart ?? child.range().start.index;
    const end = child.range().end.index;
    chunks.push({
      node: child,
      name: memberName(child),
      text: source.slice(start, end).trim(),
      start,
      end,
      originalIndex: chunks.length,
    });
    leadingStart = null;
  }

  return chunks;
}

function sortChunks(chunks: MemberChunk[], order: string[]): MemberChunk[] {
  return [...chunks].sort((a, b) => {
    const indexA = correctIndex(order, a);
    const indexB = correctIndex(order, b);
    if (indexA !== indexB) return indexA - indexB;
    const nameCompare = a.name.localeCompare(b.name);
    return nameCompare !== 0 ? nameCompare : a.originalIndex - b.originalIndex;
  });
}

function replacementFor(container: SgNode<TSX>, chunks: MemberChunk[], order: string[], sep: string): Edit | null {
  if (chunks.length <= 1) return null;
  const sorted = sortChunks(chunks, order);
  const changed = sorted.some((chunk, index) => chunk.originalIndex !== index);
  if (!changed) return null;
  return {
    startPos: chunks[0]!.start,
    endPos: chunks[chunks.length - 1]!.end,
    insertedText: sorted.map((chunk) => chunk.text).join(sep),
  };
}

const transform: Transform<TSX> = async (root, options) => {
  const rootNode = root.root();
  if (!explicitRequireDisabled(options.params?.["explicit-require"]) && !hasReact(rootNode)) {
    return null;
  }

  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("sort-comp-reorders");
  const methodsOrder = stringArrayParam(options.params?.methodsOrder) ??
    await getMethodsOrderFromEslint(root.filename()) ??
    DEFAULT_METHODS_ORDER;

  for (const config of reactCreateClassConfigs(rootNode)) {
    const edit = replacementFor(config, collectChunks(config, source), methodsOrder, ",\n\n  ");
    if (edit) {
      edits.push(edit);
      metric.increment({ file: metricFile(root.filename()), kind: "createClass" });
    }
  }

  for (const body of reactClassBodies(rootNode)) {
    const edit = replacementFor(body, collectChunks(body, source), methodsOrder, "\n\n  ");
    if (edit) {
      edits.push(edit);
      metric.increment({ file: metricFile(root.filename()), kind: "class" });
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
