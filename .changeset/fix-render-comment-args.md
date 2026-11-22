---
"react-19-replace-reactdom-render": patch
---

Ignore comments inside `render(...)` / `unmountComponentAtNode(...)` when reading call arguments. A comment before the element (e.g. an eslint directive) was taken as the first argument, shifting every argument and producing code that no longer parsed. Comments before the element are now kept inside `root.render(...)`.
