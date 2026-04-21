# Contributing

This repository is a pnpm workspace of JSSG codemods under `codemods/*`.

## Setup

```bash
pnpm install
```

Required local checks before opening a pull request:

```bash
pnpm run test
pnpm run check-types
```

Or run the combined check:

```bash
pnpm run ci
```

## Adding or updating codemods

- Keep each codemod self-contained under `codemods/<slug>/`.
- Update the codemod package README when behavior or usage changes.
- Add or extend snapshot fixtures under the codemod’s `tests/` directory for every behavioral change.

## Versioning and publishing

This repo uses Changesets to version codemod packages.

To prepare a release entry for your change:

```bash
pnpm changeset
```

When release changesets land on `main`, GitHub Actions:

1. opens or updates the release PR via Changesets
2. tags released codemod package versions as `<package-name>@v<version>`
3. publishes each tagged codemod through `codemod/publish-action@v1`
