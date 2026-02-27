import { useContext } from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const theme = useContext(ThemeContext);
  const user = useContext(UserContext);
  
  return <div>{theme.color}</div>;
}
