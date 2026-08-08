# react-19-replace-string-ref

Replace string refs in React class components with callback refs that assign through `this.refs`.

On unmount, React invokes callback refs with `null`. The generated callback deletes the `this.refs` property in that case (instead of assigning `null`) so behavior stays closer to string refs for checks like `typeof this.refs.refName`, `'refName' in this.refs`, and `Object.keys(this.refs)`.

## Usage

```bash
npx codemod react-19-replace-string-ref --target <path>
```
