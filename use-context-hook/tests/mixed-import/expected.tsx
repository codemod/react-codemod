import { useState, use, useEffect } from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const [count, setCount] = useState(0);
  const theme = use(ThemeContext);
  
  useEffect(() => {
    console.log(theme);
  }, [theme]);
  
  return <div>{count}</div>;
}
