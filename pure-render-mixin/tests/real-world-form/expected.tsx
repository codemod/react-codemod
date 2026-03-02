var React = require("react/addons");
var Form = React.createClass({
  getInitialState: function() {
    return { values: {} };
  },

  handleSubmit: function(e) {
    e.preventDefault();
    this.props.onSubmit(this.state.values);
  },

  
  shouldComponentUpdate: function(nextProps, nextState) {

    return React.addons.shallowCompare(this, nextProps, nextState);

  },

  render: function() {
    return (
      <form onSubmit={this.handleSubmit}>
        <input name="email" />
        <button type="submit">Submit</button>
      </form>
    );
  },
});

module.exports = Form;
