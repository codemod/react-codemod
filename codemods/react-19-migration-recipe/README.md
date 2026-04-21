# react-19-migration-recipe

Run all React 19 migration codemods in sequence.

## Usage

```bash
npx codemod @react-new/react-19-migration-recipe --target <path>
```

This recipe applies the following codemods:

1. [**replace-reactdom-render**](https://app.codemod.com/registry/@react-new/replace-reactdom-render) — replace `ReactDOM.render` with `createRoot(...).render(...)`
2. [**replace-string-ref**](https://app.codemod.com/registry/@react-new/replace-string-ref) — replace deprecated string refs with callback refs
3. [**replace-act-import**](https://app.codemod.com/registry/@react-new/replace-act-import) — move `act` from `react-dom/test-utils` to `react`
4. [**replace-use-form-state**](https://app.codemod.com/registry/@react-new/replace-use-form-state) — rename `useFormState` to `useActionState`
5. [**use-context-hook**](https://app.codemod.com/registry/@react-new/use-context-hook) — replace `useContext` with `use`
