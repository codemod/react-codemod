import { use } from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const theme = use(ThemeContext);
  const user = use(UserContext);
  
  return <div>{theme.color}</div>;
}
