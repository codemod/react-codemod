const React = require("react");
const { unstable_ViewTransition: ViewTransition, unstable_addTransitionType, useState } = require("react");

function Card({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <React.unstable_Activity mode={open ? "visible" : "hidden"}>
      <ViewTransition>{children}</ViewTransition>
    </React.unstable_Activity>
  );
}

function markNavigation() {
  unstable_addTransitionType("navigation");
}

module.exports = { Card, markNavigation };
