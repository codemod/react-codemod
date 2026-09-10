const React = require("react");
const { ViewTransition, addTransitionType, useState } = require("react");

function Card({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <React.Activity mode={open ? "visible" : "hidden"}>
      <ViewTransition>{children}</ViewTransition>
    </React.Activity>
  );
}

function markNavigation() {
  addTransitionType("navigation");
}

module.exports = { Card, markNavigation };
