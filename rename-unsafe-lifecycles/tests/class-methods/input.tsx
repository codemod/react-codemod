import React, { Component } from "react";

class MyComponent extends Component {
  componentWillMount() {
    console.log("mounting");
  }

  componentWillReceiveProps(nextProps) {
    console.log("receiving props", nextProps);
  }

  componentWillUpdate(nextProps, nextState) {
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
