import { use, use as read } from "react";

function Component() {
  const theme = read(ThemeContext);
  const fn = use;
  return <div>{theme}</div>;
}
