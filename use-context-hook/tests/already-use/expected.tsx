import { use } from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const theme = use(ThemeContext);
  
  return <div>{theme.color}</div>;
}
