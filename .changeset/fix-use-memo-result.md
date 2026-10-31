---
"react-19-remove-memoization": patch
---

Replace `useMemo(factory, deps)` with the factory's result instead of the factory function, so memoized values
stay values. Only unwrap parameterless factories; keep return-type annotations and `useMemo<T>` typing; invoke
member factories unbound via `(0, obj.fn)()`; convert nested memoization inside-out; and remove unused import
bindings by local alias so duplicate `useMemo as a` / `useMemo as b` specifiers stay independent. Preserve
`import type` and semicolon style on React imports, and leave imports that lose no specifier untouched.
