import React from "react";

class Form extends React.Component {
  submit() {
    const input = React.findDOMNode(this.refs.emailInput);
    input.focus();
  }
  render() {
    return (
      <form>
        <input ref="emailInput" type="email" />
      </form>
    );
  }
}
