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

const TEST_UTILS_MODULE = "react-dom/test-utils";
const REACT_MODULE = "react";

function sourceText(node: SgNode<TSX>): string | null {
  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) return fragment.text();
  const text = node.text();
  if (text.length >= 2) return text.slice(1, -1);
  return null;
}

function importSource(node: SgNode<TSX>): string | null {
  const source = node.field("source") ?? node.find({ rule: { kind: "string" } });
  return source ? sourceText(source) : null;
}

function exportedSpecifierName(specifier: SgNode<TSX>): string | null {
  const identifiers = specifier.children().filter((child) =>
    child.isNamed() && child.kind() === "identifier"
  );
  return identifiers.at(-1)?.text() ?? null;
}

function hasActExportFromReact(rootNode: SgNode<TSX, "program">): boolean {
  for (const exp of rootNode.findAll({ rule: { kind: "export_statement" } })) {
    if (importSource(exp) !== REACT_MODULE) continue;

    for (const specifier of exp.findAll({ rule: { kind: "export_specifier" } })) {
      if (exportedSpecifierName(specifier) === "act") {
        return true;
      }
    }
  }

  return false;
}

function parseProgram(source: string): SgNode<TSX, "program"> {
  return parse<TSX>("tsx", source).root();
}

function actSpecifier(localName: string): { name: string; alias?: string } {
  return localName === "act" ? { name: "act" } : { name: "act", alias: localName };
}

type Metric = ReturnType<typeof useMetricAtom>;

function migrateMemberActImports(
  initialSource: string,
  metric: Metric,
  filename: string,
): string | null {
  let source = initialSource;
  let program = parseProgram(source);
  const testUtilsImport = getImport(program, {
    type: "default",
    from: TEST_UTILS_MODULE,
  });
  if (!testUtilsImport) return null;

  const actMemberCalls = program.findAll({
    rule: {
      kind: "member_expression",
      has: {
        kind: "property_identifier",
        regex: "^act$",
      },
    },
  });

  const memberEdits: Edit[] = [];
  for (const member of actMemberCalls) {
    const objNode = member.field("object");
    if (objNode?.text() !== testUtilsImport.alias) continue;
    const reactBinding = getImport(program, { type: "default", from: REACT_MODULE });
    memberEdits.push(objNode.replace(reactBinding?.alias ?? "React"));
    metric.increment({ file: metricFile(filename), pattern: "member-call" });
  }

  if (memberEdits.length === 0) return null;

  source = program.commitEdits(memberEdits);
  program = parseProgram(source);

  const reactBinding = getImport(program, { type: "default", from: REACT_MODULE });

  // Add React before removing test-utils so insertion is anchored after an
  // existing import (avoids commitEdits panics on leading-newline + JSX files).
  if (!reactBinding) {
    const addEdit = addImport(
      program,
      testUtilsImport.isNamespace
        ? { type: "namespace", name: "React", from: REACT_MODULE }
        : {
            type: "default",
            name: "React",
            from: REACT_MODULE,
            moduleType: testUtilsImport.moduleType,
          },
    );
    if (addEdit) {
      source = program.commitEdits([addEdit]);
      program = parseProgram(source);
    }
  }

  const removeEdit = removeImport(program, {
    type: testUtilsImport.isNamespace ? "namespace" : "default",
    from: TEST_UTILS_MODULE,
  });
  if (removeEdit) {
    source = program.commitEdits([removeEdit]);
  }

  return source;
}

function migrateNamedActImports(
  initialSource: string,
  metric: Metric,
  filename: string,
): string | null {
  let source = initialSource;
  let program = parseProgram(source);
  // getAllImports falls back to namespace imports when no named match exists.
  const namedActs = getAllImports(program, {
    type: "named",
    name: "act",
    from: TEST_UTILS_MODULE,
  }).filter((imp) => !imp.isNamespace);

  if (namedActs.length === 0) {
    return null;
  }

  const moduleType = namedActs[0]!.moduleType;
  const seenLocals = new Set<string>();
  const specifiers: Array<{ name: string; alias?: string }> = [];
  for (const imp of namedActs) {
    if (seenLocals.has(imp.alias)) continue;
    seenLocals.add(imp.alias);
    specifiers.push(actSpecifier(imp.alias));
  }

  // addImport skips by exported name, so all aliases of `act` must be added together.
  // Add before remove so new imports are anchored after existing statements.
  const addEdit = addImport(program, {
    type: "named",
    specifiers,
    from: REACT_MODULE,
    moduleType,
  });
  if (addEdit) {
    source = program.commitEdits([addEdit]);
  }

  // removeImport only removes the first matching statement per call.
  while (true) {
    program = parseProgram(source);
    // Guard: removeImport can throw when only a namespace import remains,
    // because getImport falls back to namespaces for missing named specs.
    const remaining = getAllImports(program, {
      type: "named",
      name: "act",
      from: TEST_UTILS_MODULE,
    }).filter((imp) => !imp.isNamespace);
    if (remaining.length === 0) break;

    const removeEdit = removeImport(program, {
      type: "named",
      specifiers: ["act"],
      from: TEST_UTILS_MODULE,
    });
    if (!removeEdit) break;
    source = program.commitEdits([removeEdit]);
  }

  metric.increment({ file: metricFile(filename), pattern: "named-import" });
  return source;
}

function migrateReExports(
  rootNode: SgNode<TSX, "program">,
  metric: Metric,
  filename: string,
): Edit[] {
  const edits: Edit[] = [];
  const exportDecls = rootNode.findAll({
    rule: {
      kind: "export_statement",
      has: {
        kind: "string",
        regex: "react-dom/test-utils",
      },
    },
  });

  const alreadyExportsActFromReact = hasActExportFromReact(rootNode);
  for (const exp of exportDecls) {
    const hasExportAll =
      exp.has({ rule: { kind: "namespace_export" } }) ||
      exp.children().some((c) => c.text() === "*");
    if (hasExportAll && !alreadyExportsActFromReact) {
      const insertPos = exp.range().end.index;
      edits.push({
        startPos: insertPos,
        endPos: insertPos,
        insertedText: "\nexport { act } from \"react\";",
      });
      metric.increment({ file: metricFile(filename), pattern: "re-export" });
    }
  }
  return edits;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const metric = useMetricAtom("replace-act-import-migrations");
  const filename = root.filename();

  const reExportEdits = migrateReExports(rootNode, metric, filename);
  let source = reExportEdits.length > 0
    ? rootNode.commitEdits(reExportEdits)
    : rootNode.text();
  let changed = reExportEdits.length > 0;

  const memberResult = migrateMemberActImports(source, metric, filename);
  if (memberResult !== null) {
    source = memberResult;
    changed = true;
  }

  const namedResult = migrateNamedActImports(source, metric, filename);
  if (namedResult !== null) {
    source = namedResult;
    changed = true;
  }

  return changed ? source : null;
};

export default transform;
