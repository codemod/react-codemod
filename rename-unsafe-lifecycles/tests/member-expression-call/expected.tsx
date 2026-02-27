import React, { Component } from "react";

class MyComponent extends Component {
  UNSAFE_componentWillMount() {
    console.log("mounting");
  }

  componentDidMount() {
    this.UNSAFE_componentWillMount();
  }

  render() {
    return <div>Hello</div>;
  }
}

export default MyComponent;
