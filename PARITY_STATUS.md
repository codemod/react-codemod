# Legacy Parity Status

Last updated: 2026-04-15

Status meanings:

- `Certified`: replacement-grade rollout confidence. Strict/default package tests are green, public test posture is portable, and there are no known rollout-blocking logic gaps versus the legacy jscodeshift codemod. `Certified` may include intentional safe extensions on legacy-unsupported edge cases, as long as intentional legacy behavior remains unbroken.
- `Legacy Snapshot`: preserved as upstream jscodeshift source and tests on this branch, but not promoted as part of the active JSSG replacement surface.

## Active JSSG Surface

These are the only codemods promoted as active replacements on this branch.

| Codemod | Legacy Source | Status | Notes |
| --- | --- | --- | --- |
| `replace-use-form-state` | `replace-use-form-state.ts` | `Certified` | Legacy fixture surface plus added multi-import regression coverage are green. Collection-wide replacement on matching `react-dom` imports fixes a real parity gap, and the broader multi-import handling is treated as an acceptable safe extension where legacy only partially migrated files. |
| `replace-act-import` | `replace-act-import.ts` | `Certified` | Legacy fixture surface plus added multi-import regression coverage. This closes a real parity gap, and the mixed test-utils partial-removal path is an acceptable safe extension that does not break intentional legacy behavior. |
| `replace-string-ref` | `replace-string-ref.ts` | `Certified` | Legacy fixture surface plus added namespace/default-export/multi-ref coverage are green, and the direct-superclass guard restores the intended direct-superclass behavior by avoiding the prior mixin false positive. |
| `replace-reactdom-render` | `replace-reactdom-render.ts` | `Certified` | Legacy fixtures plus added multi-alias regression coverage are green. The extra multi-alias handling is an acceptable safe extension over legacy implementation limits; it preserves intentional legacy behavior while covering additional valid cases. |
| `react-proptypes-to-prop-types` | `React-PropTypes-to-prop-types.js` | `Certified` | Full legacy fixture surface is green, targeted mixed-import validation is aligned, and no JSSG-specific rollout blocker was found in the audit. No additional extension beyond the legacy behavior is currently relied on for certification. |
| `use-context-hook` | `use-context-hook.ts` | `Certified` | Legacy fixture surface plus added multi-import regression coverage are green. The multi-import handling goes beyond the legacy implementation, but it is treated as an acceptable safe extension because it preserves intentional legacy behavior while covering additional valid cases. |

## Legacy Snapshot Surface

These codemods remain available only as an upstream jscodeshift snapshot under [`codemods/legacy/transforms/`](./codemods/legacy/transforms/):

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
