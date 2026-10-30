import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import { parse } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import {
  addImport,
  getAllImports,
  getImport,
  removeImport,
} from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

const REACT_DOM_MODULE = "react-dom";
const REACT_MODULE = "react";

type ModuleType = "esm" | "cjs";
type Metric = ReturnType<typeof useMetricAtom>;

function parseProgram(source: string): SgNode<TSX, "program"> {
  return parse<TSX>("tsx", source).root();
}

function isImportBindingNode(node: SgNode<TSX>): boolean {
  return node.ancestors().some((ancestor) => {
    const kind = ancestor.kind();
    return (
      kind === "import_statement" ||
      kind === "import_specifier" ||
      kind === "shorthand_property_identifier_pattern" ||
      kind === "pair_pattern"
    );
  });
}

function useActionStateSpecifier(localName: string): { name: string; alias?: string } {
  return localName === "useFormState"
    ? { name: "useActionState" }
    : { name: "useActionState", alias: localName };
}

function migrateMemberUseFormState(
  initialSource: string,
  metric: Metric,
  filename: string,
): { source: string; changed: boolean; moduleType: ModuleType | null } {
  let source = initialSource;
  let program = parseProgram(source);
  const reactDomBindings = getAllImports(program, {
    type: "default",
    from: REACT_DOM_MODULE,
  });

  if (reactDomBindings.length === 0) {
    return { source, changed: false, moduleType: null };
  }

  const bindingNames = new Map(
    reactDomBindings.map((binding) => [binding.alias, binding.moduleType] as const),
  );

  const memberEdits: Edit[] = [];
  let moduleType: ModuleType | null = null;

  for (const member of program.findAll({
    rule: {
      kind: "member_expression",
      has: {
        kind: "property_identifier",
        regex: "^useFormState$",
      },
    },
  })) {
    const objNode = member.field("object");
    if (!objNode) continue;
    const bindingModuleType = bindingNames.get(objNode.text());
    if (!bindingModuleType) continue;

    memberEdits.push(member.replace("useActionState"));
    moduleType = bindingModuleType;
    metric.increment({ file: metricFile(filename), pattern: "member-call" });
  }

  if (memberEdits.length === 0) {
    return { source, changed: false, moduleType: null };
  }

  source = program.commitEdits(memberEdits);
  return { source, changed: true, moduleType };
}

function migrateNamedUseFormState(
  initialSource: string,
  metric: Metric,
  filename: string,
): { source: string; changed: boolean } {
  let source = initialSource;
  let program = parseProgram(source);
  // getAllImports falls back to namespace imports when no named match exists.
  const namedImports = getAllImports(program, {
    type: "named",
    name: "useFormState",
    from: REACT_DOM_MODULE,
  }).filter((imp) => !imp.isNamespace);

  if (namedImports.length === 0) {
    return { source, changed: false };
  }

  const moduleType = namedImports[0]!.moduleType;
  const seenLocals = new Set<string>();
  const specifiers: Array<{ name: string; alias?: string }> = [];
  let shouldRenameUseFormState = false;

  for (const imp of namedImports) {
    if (imp.alias === "useFormState") {
      shouldRenameUseFormState = true;
    }
    if (seenLocals.has(imp.alias)) continue;
    seenLocals.add(imp.alias);
    specifiers.push(useActionStateSpecifier(imp.alias));
  }

  if (shouldRenameUseFormState) {
    const renameEdits: Edit[] = [];
    for (const node of program.findAll({
      rule: {
        any: [
          { kind: "identifier", regex: "^useFormState$" },
          { kind: "type_identifier", regex: "^useFormState$" },
        ],
      },
    })) {
      // Preserve prior behavior for locals/types; skip import/require bindings.
      if (isImportBindingNode(node)) continue;
      if (node.ancestors().some((ancestor) => ancestor.kind() === "import_statement")) continue;
      renameEdits.push(node.replace("useActionState"));
    }
    if (renameEdits.length > 0) {
      source = program.commitEdits(renameEdits);
    }
  }

  program = parseProgram(source);
  const addEdit = addImport(program, {
    type: "named",
    specifiers,
    from: REACT_MODULE,
    moduleType,
  });
  if (addEdit) {
    source = program.commitEdits([addEdit]);
  }

  while (true) {
    program = parseProgram(source);
    // Guard: removeImport can throw when only a namespace import remains,
    // because getImport falls back to namespaces for missing named specs.
    const remaining = getAllImports(program, {
      type: "named",
      name: "useFormState",
      from: REACT_DOM_MODULE,
    }).filter((imp) => !imp.isNamespace);
    if (remaining.length === 0) break;

    const removeEdit = removeImport(program, {
      type: "named",
      specifiers: ["useFormState"],
      from: REACT_DOM_MODULE,
    });
    if (!removeEdit) break;
    source = program.commitEdits([removeEdit]);
  }

  metric.increment({ file: metricFile(filename), pattern: "named-import" });
  return { source, changed: true };
}

function ensureUseActionStateImport(
  initialSource: string,
  moduleType: ModuleType,
): string {
  const program = parseProgram(initialSource);
  if (getImport(program, { type: "named", name: "useActionState", from: REACT_MODULE })) {
    return initialSource;
  }

  const addEdit = addImport(program, {
    type: "named",
    specifiers: [{ name: "useActionState" }],
    from: REACT_MODULE,
    moduleType,
  });
  return addEdit ? program.commitEdits([addEdit]) : initialSource;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const metric = useMetricAtom("replace-use-form-state-migrations");
  const filename = root.filename();

  let source = rootNode.text();
  let changed = false;

  const memberResult = migrateMemberUseFormState(source, metric, filename);
  if (memberResult.changed) {
    source = memberResult.source;
    changed = true;
  }

  const namedResult = migrateNamedUseFormState(source, metric, filename);
  if (namedResult.changed) {
    source = namedResult.source;
    changed = true;
  }

  if (memberResult.changed && memberResult.moduleType) {
    // Member rewrites always need a bare useActionState binding.
    source = ensureUseActionStateImport(source, memberResult.moduleType);
  }

  return changed ? source : null;
};

export default transform;
