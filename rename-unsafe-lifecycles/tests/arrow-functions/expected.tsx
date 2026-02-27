import React, { Component } from "react";

class MyComponent extends Component {
  UNSAFE_componentWillMount = () => {
    console.log("mounting");
  };

  render() {
    return <div>Hello</div>;
  }
}

export default MyComponent;
