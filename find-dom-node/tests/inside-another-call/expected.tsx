import React from "react";

class SearchInput extends React.Component {
  componentDidMount() {
    // Real pattern: focus the input after mount or scroll it into view
    const el = React.findDOMNode(this.refs.input);
    if (el && typeof el.focus === "function") {
      el.focus();
    }
  }

  handleSubmit = () => {
    const node = React.findDOMNode(this);
    if (node) {
      node.scrollIntoView({ behavior: "smooth" });
    }
  };

  render() {
    return <input ref="input" type="search" />;
  }
}

export default SearchInput;
