import React, { Component } from "react";

class MyComponent extends Component {
  componentDidMount() {
    console.log("mounted");
  }

  componentDidUpdate(prevProps: unknown) {
    console.log("updated", prevProps);
  }

  render() {
    return <div>Hello</div>;
  }
}

export default MyComponent;
