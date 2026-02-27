import React, { Component } from "react";

class MyComponent extends Component {
  UNSAFE_componentWillUpdate(nextProps: unknown, nextState: unknown) {
    console.log("will update", nextProps, nextState);
  }

  render() {
    return <div>Hello</div>;
  }
}

export default MyComponent;
