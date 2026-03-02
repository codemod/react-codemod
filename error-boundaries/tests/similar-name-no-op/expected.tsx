import React from "react";

// Should NOT transform - different identifier
class Component extends React.Component {
  unstable_handleErrorX() {}
  handleError() {}
  render() {
    return null;
  }
}
