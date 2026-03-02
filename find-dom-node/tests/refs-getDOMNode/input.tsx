import React from "react";

class Form extends React.Component {
  submit() {
    const input = this.refs.emailInput.getDOMNode();
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
