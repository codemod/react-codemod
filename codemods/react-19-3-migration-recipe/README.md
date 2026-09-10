# react-19-3-migration-recipe

Run all React 19.3 adoption codemods in sequence.

React 19.3 has no breaking changes, so this recipe does not fix anything that stops working. It moves code from experimental names and pre-19.3 workarounds onto the stable APIs.

## Usage

```bash
npx codemod react-19-3-migration-recipe --target <path>
```

This recipe applies the following codemods:

1. [**react-19-3-unprefix-stable-apis**](https://app.codemod.com/registry/react-19-3-unprefix-stable-apis) — rename `unstable_ViewTransition`, `unstable_addTransitionType`, `unstable_Activity`, and `experimental_useEffectEvent` to their stable names
2. [**react-19-remove-context-provider**](https://app.codemod.com/registry/react-19-remove-context-provider) — replace `Context.Provider` with `Context`
3. [**react-19-3-use-browser**](https://app.codemod.com/registry/react-19-3-use-browser) — replace the mounted-state pattern for browser-only components with `use(browser())`
4. [**react-19-3-fragment-ref-wrappers**](https://app.codemod.com/registry/react-19-3-fragment-ref-wrappers) — replace `display: contents` wrapper elements that only hold a ref with Fragment refs
