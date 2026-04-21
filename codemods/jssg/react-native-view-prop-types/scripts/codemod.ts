import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";

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

function stringValue(node: SgNode<TSX>): string {
  const evaluated = Function(`"use strict"; return (${node.text()});`)() as unknown;
  if (typeof evaluated !== "string") {
    throw new Error(`Expected string literal, got "${typeof evaluated}"`);
  }

  return evaluated;
}

function isRequireCall(node: SgNode<TSX> | null, source: string): boolean {
  if (!node || node.kind() !== "call_expression") {
    return false;
  }

  const callee = node.field("function");
  const firstArg = callArguments(node)[0];
  return callee?.kind() === "identifier" &&
    callee.text() === "require" &&
    firstArg?.kind() === "string" &&
    stringValue(firstArg) === source;
}

function isViewPropTypesAccess(node: SgNode<TSX>): boolean {
  if (node.kind() !== "member_expression") {
    return false;
  }

  const object = node.field("object");
  const property = node.field("property");
  return object?.kind() === "identifier" &&
    object.text() === "View" &&
    property?.kind() === "property_identifier" &&
    property.text() === "propTypes";
}

function isViewBindingNode(node: SgNode<TSX>): boolean {
  if (node.text() !== "View") {
    return false;
  }

  if (node.ancestors().some((ancestor) => ancestor.kind() === "import_statement")) {
    return false;
  }

  const parent = node.parent();
  if (!parent) {
    return false;
  }

  if (parent.kind() === "member_expression" &&
    parent.field("object")?.id() === node.id() &&
    parent.field("property")?.text() === "propTypes") {
    return false;
  }

  if (parent.kind() === "member_expression" && parent.field("property")?.id() === node.id()) {
    return false;
  }

  if (parent.kind() === "variable_declarator" && parent.field("name")?.id() === node.id()) {
    return false;
  }

  if (parent.kind() === "shorthand_property_identifier_pattern") {
    const pattern = parent.ancestors().find((ancestor) => ancestor.kind() === "object_pattern");
    if (pattern?.parent()?.kind() === "variable_declarator") {
      return false;
    }
  }

  return true;
}

function findHasteImportStatement(rootNode: SgNode<TSX>): SgNode<TSX> | null {
  for (const importStmt of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = importStmt.field("source");
    if (source?.kind() === "string" && stringValue(source) === "View") {
      return importStmt;
    }
  }

  return null;
}

function findHasteRequireStatement(rootNode: SgNode<TSX>): SgNode<TSX> | null {
  for (const declaration of rootNode.findAll({
    rule: {
      any: [
        { pattern: "const View = require('View')" },
        { pattern: "let View = require('View')" },
        { pattern: "var View = require('View')" },
      ],
    },
  })) {
    if (declaration.kind() === "lexical_declaration" || declaration.kind() === "variable_declaration") {
      return declaration;
    }
  }

  return null;
}

function findReactNativeImportStatement(rootNode: SgNode<TSX>): SgNode<TSX> | null {
  for (const importStmt of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = importStmt.field("source");
    if (source?.kind() === "string" && stringValue(source) === "react-native") {
      const hasView = importStmt.findAll({ rule: { kind: "import_specifier" } })
        .some((specifier) => specifier.field("name")?.text() === "View");
      if (hasView) {
        return importStmt;
      }
    }
  }

  return null;
}

function findReactNativeRequireStatement(rootNode: SgNode<TSX>): SgNode<TSX> | null {
  for (const declarator of rootNode.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name?.kind() !== "object_pattern" || !isRequireCall(value, "react-native")) {
      continue;
    }

    const hasView = name.findAll({ rule: { kind: "shorthand_property_identifier_pattern" } })
      .some((property) => property.text() === "View");
    if (hasView) {
      return declarator.ancestors().find((ancestor) =>
        ancestor.kind() === "lexical_declaration" || ancestor.kind() === "variable_declaration"
      ) ?? null;
    }
  }

  return null;
}

function viewImportSpecifier(importStmt: SgNode<TSX>): SgNode<TSX> | null {
  return importStmt.findAll({ rule: { kind: "import_specifier" } })
    .find((specifier) => specifier.field("name")?.text() === "View") ?? null;
}

function viewRequireProperty(statement: SgNode<TSX>): SgNode<TSX> | null {
  return statement.findAll({ rule: { kind: "shorthand_property_identifier_pattern" } })
    .find((property) => property.text() === "View") ?? null;
}

function hasImportSpecifier(importStmt: SgNode<TSX>, name: string): boolean {
  return importStmt.findAll({ rule: { kind: "import_specifier" } })
    .some((specifier) => specifier.field("name")?.text() === name);
}

function hasRequireProperty(statement: SgNode<TSX>, name: string): boolean {
  return statement.findAll({ rule: { kind: "shorthand_property_identifier_pattern" } })
    .some((property) => property.text() === name);
}

function hasHasteViewPropTypesImport(rootNode: SgNode<TSX>): boolean {
  return rootNode.findAll({ rule: { kind: "import_statement" } })
    .some((importStmt) => {
      const source = importStmt.field("source");
      return source?.kind() === "string" &&
        stringValue(source) === "ViewPropTypes";
    });
}

function hasHasteViewPropTypesRequire(rootNode: SgNode<TSX>): boolean {
  return rootNode.findAll({
    rule: {
      any: [
        { pattern: "const ViewPropTypes = require('ViewPropTypes')" },
        { pattern: "let ViewPropTypes = require('ViewPropTypes')" },
        { pattern: "var ViewPropTypes = require('ViewPropTypes')" },
      ],
    },
  }).length > 0;
}

function statementInsertionIndex(source: string, node: SgNode<TSX>): number {
  let index = node.range().end.index;
  while (index < source.length && (source[index] === ";" || source[index] === "\r" || source[index] === "\n")) {
    index++;
  }
  return index;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const source = rootNode.text();
  const edits: Edit[] = [];
  const metric = useMetricAtom("react-native-view-prop-types-replacements");

  const hasteImportStatement = findHasteImportStatement(rootNode);
  const hasteRequireStatement = findHasteRequireStatement(rootNode);
  const reactNativeImportStatement = findReactNativeImportStatement(rootNode);
  const reactNativeRequireStatement = findReactNativeRequireStatement(rootNode);
  const hasExistingHasteViewPropTypesImport = hasHasteViewPropTypesImport(rootNode);
  const hasExistingHasteViewPropTypesRequire = hasHasteViewPropTypesRequire(rootNode);
  const hasExistingReactNativeImportViewPropTypes = reactNativeImportStatement
    ? hasImportSpecifier(reactNativeImportStatement, "ViewPropTypes")
    : false;
  const hasExistingReactNativeRequireViewPropTypes = reactNativeRequireStatement
    ? hasRequireProperty(reactNativeRequireStatement, "ViewPropTypes")
    : false;

  let replacements = 0;
  for (const member of rootNode.findAll({ rule: { kind: "member_expression" } })) {
    if (!isViewPropTypesAccess(member)) {
      continue;
    }

    edits.push(member.replace("ViewPropTypes"));
    replacements++;
  }

  if (replacements === 0) {
    return null;
  }

  const keepViewBinding = rootNode.findAll({
    rule: {
      any: [
        { kind: "identifier" },
        { kind: "property_identifier" },
      ],
    },
  }).some(isViewBindingNode);

  if (hasteImportStatement) {
    if (hasExistingHasteViewPropTypesImport) {
      // Keep the existing import intact; the file already binds ViewPropTypes.
    } else if (keepViewBinding) {
      edits.push({
        startPos: hasteImportStatement.range().end.index,
        endPos: hasteImportStatement.range().end.index,
        insertedText: "\nimport ViewPropTypes from 'ViewPropTypes';",
      });
    } else {
      edits.push(hasteImportStatement.replace("import ViewPropTypes from 'ViewPropTypes';"));
    }
  } else if (hasteRequireStatement) {
    if (hasExistingHasteViewPropTypesRequire) {
      // Keep the existing require intact; the file already binds ViewPropTypes.
    } else if (keepViewBinding) {
      edits.push({
        startPos: statementInsertionIndex(source, hasteRequireStatement),
        endPos: statementInsertionIndex(source, hasteRequireStatement),
        insertedText: "\nconst ViewPropTypes = require('ViewPropTypes');\n",
      });
    } else {
      edits.push(hasteRequireStatement.replace("const ViewPropTypes = require('ViewPropTypes');"));
    }
  } else if (reactNativeImportStatement) {
    const specifier = viewImportSpecifier(reactNativeImportStatement);
    if (specifier) {
      if (hasExistingReactNativeImportViewPropTypes) {
        // Keep the existing import intact; the file already binds ViewPropTypes.
      } else if (keepViewBinding) {
        edits.push({
          startPos: specifier.range().end.index,
          endPos: specifier.range().end.index,
          insertedText: ", ViewPropTypes",
        });
      } else {
        edits.push(specifier.replace("ViewPropTypes"));
      }
    }
  } else if (reactNativeRequireStatement) {
    const property = viewRequireProperty(reactNativeRequireStatement);
    if (property) {
      if (hasExistingReactNativeRequireViewPropTypes) {
        // Keep the existing require intact; the file already binds ViewPropTypes.
      } else if (keepViewBinding) {
        edits.push({
          startPos: property.range().end.index,
          endPos: property.range().end.index,
          insertedText: ", ViewPropTypes",
        });
      } else {
        edits.push(property.replace("ViewPropTypes"));
      }
    }
  }

  metric.increment({ file: metricFile(root.filename()) }, replacements);
  return rootNode.commitEdits(edits);
};

export default transform;
