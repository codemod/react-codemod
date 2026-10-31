import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import {
  addImport,
  getImport,
  updateImport,
} from "@jssg/utils/javascript/imports";

function metricFile(filename: string): string {
  const cwd = process.cwd() + "/";
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
}

function isViewPropTypesAccess(node: SgNode<TSX>, viewAlias: string): boolean {
  if (node.kind() !== "member_expression") {
    return false;
  }

  const object = node.field("object");
  const property = node.field("property");
  return object?.kind() === "identifier" &&
    object.text() === viewAlias &&
    property?.kind() === "property_identifier" &&
    property.text() === "propTypes";
}

function isViewBindingNode(node: SgNode<TSX>, viewAlias: string): boolean {
  if (node.text() !== viewAlias) {
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

type ViewBinding = {
  alias: string;
  from: "View" | "react-native";
  moduleType: "esm" | "cjs";
  isNamespace: boolean;
};

function resolveViewBinding(rootNode: SgNode<TSX, "program">): ViewBinding | null {
  const haste = getImport(rootNode, { type: "default", from: "View" });
  if (haste && !haste.isNamespace) {
    return {
      alias: haste.alias,
      from: "View",
      moduleType: haste.moduleType,
      isNamespace: false,
    };
  }

  const rn = getImport(rootNode, { type: "named", name: "View", from: "react-native" });
  if (rn && !rn.isNamespace) {
    return {
      alias: rn.alias,
      from: "react-native",
      moduleType: rn.moduleType,
      isNamespace: false,
    };
  }

  return null;
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const metric = useMetricAtom("react-native-view-prop-types-replacements");

  const viewBinding = resolveViewBinding(rootNode);
  if (!viewBinding) {
    return null;
  }

  const viewAlias = viewBinding.alias;
  let replacements = 0;
  for (const member of rootNode.findAll({ rule: { kind: "member_expression" } })) {
    if (!isViewPropTypesAccess(member, viewAlias)) {
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
  }).some((node) => isViewBindingNode(node, viewAlias));

  const existingViewPropTypes =
    getImport(rootNode, { type: "default", from: "ViewPropTypes" }) ??
    getImport(rootNode, { type: "named", name: "ViewPropTypes", from: "react-native" });

  if (!existingViewPropTypes || existingViewPropTypes.isNamespace) {
    if (viewBinding.from === "View") {
      if (keepViewBinding) {
        const addEdit = addImport(rootNode, {
          type: "default",
          name: "ViewPropTypes",
          from: "ViewPropTypes",
          moduleType: viewBinding.moduleType,
        });
        if (addEdit) edits.push(addEdit);
      } else if (viewBinding.moduleType === "esm") {
        // Replace the haste View default import with ViewPropTypes.
        const viewImport = getImport(rootNode, { type: "default", from: "View" });
        const statement = viewImport?.node.ancestors().find((a) => a.kind() === "import_statement");
        if (statement) {
          edits.push(statement.replace("import ViewPropTypes from 'ViewPropTypes';"));
        }
      } else {
        const viewImport = getImport(rootNode, { type: "default", from: "View" });
        const statement = viewImport?.node.ancestors().find((a) =>
          a.kind() === "lexical_declaration" || a.kind() === "variable_declaration"
        );
        if (statement) {
          edits.push(statement.replace("const ViewPropTypes = require('ViewPropTypes');"));
        }
      }
    } else if (keepViewBinding) {
      const addEdit = addImport(rootNode, {
        type: "named",
        specifiers: [{ name: "ViewPropTypes" }],
        from: "react-native",
        moduleType: viewBinding.moduleType,
      });
      if (addEdit) edits.push(addEdit);
    } else {
      const updateEdit = updateImport(rootNode, {
        type: "named",
        from: "react-native",
        // Override local alias so `View as RNView` becomes `ViewPropTypes`, not
        // `ViewPropTypes as RNView`, matching the call-site rewrite to ViewPropTypes.
        specifiers: [{ name: "View", to: "ViewPropTypes", alias: "ViewPropTypes" }],
      });
      if (updateEdit) edits.push(updateEdit);
    }
  }

  metric.increment({ file: metricFile(root.filename()) }, replacements);
  return rootNode.commitEdits(edits);
};

export default transform;
