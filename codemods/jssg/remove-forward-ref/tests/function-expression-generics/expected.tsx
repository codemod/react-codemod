type Props<T> = { value?: T };

const MyInput = function A<T extends string>(
  {
    ref,
    ...props
  }: Props<T> & {
    ref: React.RefObject<HTMLDivElement>
  }
): JSX.Element | null {
  return null;
};
