# react-19-migration-recipe

Run all React 19 migration codemods in sequence.

## Usage

```bash
npx codemod react-19-migration-recipe --target <path>
```

This recipe applies the following codemods:

1. [**react-19-replace-reactdom-render**](https://app.codemod.com/registry/react-19-replace-reactdom-render) — replace `ReactDOM.render` with `createRoot(...).render(...)`
2. [**react-19-replace-string-ref**](https://app.codemod.com/registry/react-19-replace-string-ref) — replace deprecated string refs with callback refs
3. [**react-19-replace-act-import**](https://app.codemod.com/registry/react-19-replace-act-import) — move `act` from `react-dom/test-utils` to `react`
4. [**react-19-replace-use-form-state**](https://app.codemod.com/registry/react-19-replace-use-form-state) — rename `useFormState` to `useActionState`
5. [**react-19-prop-types-typescript**](https://app.codemod.com/registry/react-19-prop-types-typescript) — convert React `propTypes` declarations into TypeScript props interfaces
