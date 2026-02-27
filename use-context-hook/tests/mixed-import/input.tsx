import { useState, useContext, useEffect } from "react";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const [count, setCount] = useState(0);
  const theme = useContext(ThemeContext);
  
  useEffect(() => {
    console.log(theme);
  }, [theme]);
  
  return <div>{count}</div>;
}
