import React, { Component } from "react";

class MyComponent extends Component {
  UNSAFE_componentWillMount() {
    console.log("mounting");
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    console.log("receiving props", nextProps);
  }

  UNSAFE_componentWillUpdate(nextProps, nextState) {
    console.log("updating", nextProps, nextState);
  }

  componentDidMount() {
    console.log("mounted");
  }

  render() {
    return <div>Hello</div>;
  }
}

export default MyComponent;
