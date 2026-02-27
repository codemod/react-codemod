import { useContext as useCtx } from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const theme = useCtx(ThemeContext);
  return <div>{theme.name}</div>;
}

export default MyComponent;
