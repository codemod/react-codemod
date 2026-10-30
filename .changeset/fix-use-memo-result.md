---
"react-19-remove-memoization": patch
---

Replace `useMemo(factory, deps)` with the factory's result instead of the factory function, so memoized values
stay values. Preserve `import type` and semicolon style on React imports, and leave imports that lose no
specifier untouched.
