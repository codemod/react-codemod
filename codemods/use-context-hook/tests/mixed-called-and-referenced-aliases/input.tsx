import { useContext, useContext as read } from "react";

function Component() {
  const theme = read(ThemeContext);
  const fn = useContext;
  return <div>{theme}</div>;
}
