# react-19-migration-recipe

Run all React 19 migration codemods in sequence.

## Usage

```bash
npx codemod @react-new/react-19-migration-recipe --target <path>
```

This recipe applies the following codemods:

1. **replace-reactdom-render** — replace `ReactDOM.render` with `createRoot(...).render(...)`
2. **replace-string-ref** — replace deprecated string refs with callback refs
3. **replace-act-import** — move `act` from `react-dom/test-utils` to `react`
4. **replace-use-form-state** — rename `useFormState` to `useActionState`
5. **use-context-hook** — replace `useContext` with `use`
