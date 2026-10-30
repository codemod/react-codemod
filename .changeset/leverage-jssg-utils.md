---
"react-create-element-to-jsx": patch
"react-find-dom-node": patch
"react-19-3-fragment-ref-wrappers": patch
"react-prop-types-typescript": patch
"react-pure-component": patch
"react-pure-render-mixin": patch
"react-dom-to-react-dom-factories": patch
"react-native-view-prop-types": patch
"react-proptypes-to-prop-types": patch
"react-to-react-dom": patch
"react-19-remove-forward-ref": patch
"react-19-remove-legacy-context": patch
"react-19-remove-memoization": patch
"react-19-replace-act-import": patch
"react-19-replace-create-factory": patch
"react-19-replace-reactdom-render": patch
"react-19-replace-string-ref": patch
"react-19-replace-use-form-state": patch
"react-sort-comp": patch
"react-19-3-unprefix-stable-apis": patch
"react-update-react-imports": patch
"react-19-3-use-browser": patch
"react-19-use-context-hook": patch
---

Adopt `@jssg/utils` import helpers (`getImport`, `getAllImports`, `addImport`, `removeImport`, `updateImport`) across React JSSG codemods, bump to `^0.0.10`, and add fixtures covering CJS, aliases, quote/style merges, and multi-specifier import cleanup.
