# Parity Status

Last updated: 2026-04-15

Status meanings:

- `Certified`: replacement-grade confidence. Tests are green, public test posture is portable, and there are no known logic gaps versus the original jscodeshift codemod. May include safe extensions on edge cases the original did not handle, as long as original behavior remains unbroken.
- `Legacy`: available as a jscodeshift codemod under `codemods/legacy/`. Not yet ported to JSSG.

## JSSG Codemods

| Codemod | Original Source | Status | Notes |
| --- | --- | --- | --- |
| `replace-use-form-state` | `replace-use-form-state.ts` | `Certified` | Full fixture coverage plus multi-import regression tests are green. Collection-wide replacement on matching `react-dom` imports fixes a real parity gap. |
| `replace-act-import` | `replace-act-import.ts` | `Certified` | Full fixture coverage plus multi-import regression tests. Mixed test-utils partial-removal path is a safe extension. |
| `replace-string-ref` | `replace-string-ref.ts` | `Certified` | Full fixture coverage plus namespace/default-export/multi-ref tests are green. Direct-superclass guard restores intended behavior. |
| `replace-reactdom-render` | `replace-reactdom-render.ts` | `Certified` | Full fixture coverage plus multi-alias regression tests are green. |
| `react-proptypes-to-prop-types` | `React-PropTypes-to-prop-types.js` | `Certified` | Full original fixture surface is green. No JSSG-specific rollout blocker found. |
| `use-context-hook` | `use-context-hook.ts` | `Certified` | Full fixture coverage plus multi-import regression tests are green. |

## Legacy Codemods

These codemods are available as jscodeshift transforms under [`codemods/legacy/transforms/`](./codemods/legacy/transforms/):

- `class`
- `create-element-to-jsx`
- `error-boundaries`
- `findDOMNode`
- `manual-bind-to-arrow`
- `pure-component`
- `pure-render-mixin`
- `React-DOM-to-react-dom-factories`
- `ReactNative-View-propTypes`
- `react-to-react-dom`
- `remove-context-provider`
- `remove-forward-ref`
- `rename-unsafe-lifecycles`
- `sort-comp`
- `update-react-imports`
