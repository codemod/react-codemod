# Public Rollout TODO

- [x] Confirm all `react-*` and `react-19-*` registry pages are public and searchable. Owner: Mohab
- [x] Confirm recipe uses the final public package names. Owner: Mohab
- [x] Update public docs/README links if registry URLs changed after renaming. Owner: Mohab
- [x] Do one clean smoke run of `react-19-migration-recipe` from the registry. Owner: Mohab
- [x] Change codemod visibility to `public`. Owner: Mohab

- [ ] Get approval from React team to point legacy to newly published codemods. Owner: Alex
- [ ] Create codemod aliases from legacy to new codemods. Owner: Mo
- [ ] Update legacy `react/react-codemod` repo README to point users to the new repo. Owner: Mohab/React team

Nice to haves, can happen in parallel
- [ ] Update publisher display name to `Codemod` in DB. Owner: Mo
- [ ] Port historical execution counts in DB. Owner: Mo
- [ ] Monitor first public executions for install, search, and workflow issues. Owner: TBD
