import React from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const theme = React.useContext(ThemeContext);
  const user = React.useContext(UserContext);
  
  return <div>{theme.color}</div>;
}
