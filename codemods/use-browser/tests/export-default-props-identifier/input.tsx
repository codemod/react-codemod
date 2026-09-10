import React, { useState, useEffect } from "react";
import { readTheme } from "./theme";

export default function ThemeBadge(props) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) {
    return null;
  }
  return <span className={props.className}>{readTheme()}</span>;
}
