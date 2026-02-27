import React, { Component } from "react";

class MyComponent extends Component {
  componentWillMount = () => {
    console.log("mounting");
  };

  render() {
    return <div>Hello</div>;
  }
}

export default MyComponent;
