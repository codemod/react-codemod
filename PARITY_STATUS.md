# Parity Status

Last updated: 2026-04-20

Status meanings:

- `Certified`: replacement-grade confidence. Tests are green, public test posture is portable, and there are no known logic gaps versus the original jscodeshift codemod. May include safe extensions on edge cases the original did not handle, as long as original behavior remains unbroken.
- `Fixture-Verified`: JSSG port exists in this branch, package fixture suites are green, and type checks pass. May include differential/error/warning tests, but replacement-grade real-repo parity has not yet been established to the same standard as `Certified`.
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
| `create-element-to-jsx` | `create-element-to-jsx.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. 34 fixture cases plus error/differential checks are green. |
| `error-boundaries` | `error-boundaries.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `find-dom-node` | `findDOMNode.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `manual-bind-to-arrow` | `manual-bind-to-arrow.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `pure-component` | `pure-component.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. 11 fixtures plus warning/differential checks are green. |
| `pure-render-mixin` | `pure-render-mixin.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `react-dom-to-react-dom-factories` | `React-DOM-to-react-dom-factories.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `react-native-view-prop-types` | `ReactNative-View-propTypes.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `react-to-react-dom` | `react-to-react-dom.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. 14 fixtures plus error tests are green. |
| `remove-context-provider` | `remove-context-provider.ts` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `remove-forward-ref` | `remove-forward-ref.ts` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `rename-unsafe-lifecycles` | `rename-unsafe-lifecycles.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `sort-comp` | `sort-comp.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. Package fixtures and type checks are green. |
| `update-react-imports` | `update-react-imports.js` | `Fixture-Verified` | Imported from `align-with-legacy-codemods` on 2026-04-20. 33 fixtures are green. |

## Legacy Codemods

These codemods are still legacy-only under [`codemods/legacy/transforms/`](./codemods/legacy/transforms/):

- `class`

The legacy snapshot package still contains the original jscodeshift transforms for comparison and evaluation, even when a JSSG port now exists on this branch.
