import React from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const theme = React.use(ThemeContext);
  const user = React.use(UserContext);
  
  return <div>{theme.color}</div>;
}
