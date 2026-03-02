import React from "react";

class FormWithRefs extends React.Component {
  submitForm = () => {
    const emailInput = this.refs.email;
    const emailNode = React.findDOMNode(emailInput);
    if (emailNode && (emailNode as HTMLInputElement).value.trim() === "") {
      (emailNode as HTMLInputElement).focus();
      return;
    }
    // ... submit logic
  };

  render() {
    return (
      <form onSubmit={this.submitForm}>
        <input ref="email" type="email" />
        <button type="submit">Submit</button>
      </form>
    );
  }
}

export default FormWithRefs;
