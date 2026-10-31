# react-19-remove-memoization

## 0.1.5

### Patch Changes

- 424c5f3: Replace `useMemo(factory, deps)` with the factory's result instead of the factory function, so memoized values
  stay values. Only unwrap parameterless factories; keep return-type annotations and `useMemo<T>` typing; invoke
  member factories unbound via `(0, obj.fn)()`; convert nested memoization inside-out; and remove unused import
  bindings by local alias so duplicate `useMemo as a` / `useMemo as b` specifiers stay independent. Preserve
  `import type` and semicolon style on React imports, and leave imports that lose no specifier untouched.

## 0.1.4

### Patch Changes

- dbc10a9: Adopt `@jssg/utils` import helpers (`getImport`, `getAllImports`, `addImport`, `removeImport`, `updateImport`) across React JSSG codemods, bump to `^0.0.10`, and add fixtures covering CJS, aliases, quote/style merges, and multi-specifier import cleanup.
