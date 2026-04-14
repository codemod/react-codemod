const MyComponent = function Component(
  {
    ref: myRef,
    ...myProps
  }: NS.Props & {
    ref: React.RefObject<NS.Ref>
  }
) {
  return null;
};
