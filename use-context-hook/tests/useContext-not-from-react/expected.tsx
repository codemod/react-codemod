import { useContext } from "some-other-lib";
import ThemeContext from "./ThemeContext";

function MyComponent() {
  const theme = useContext(ThemeContext);
  return <div>{theme.name}</div>;
}

export default MyComponent;
