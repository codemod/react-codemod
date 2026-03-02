var React = require("react/addons");
var PureRenderMixin = React.addons.PureRenderMixin;

var Form = React.createClass({
  mixins: [PureRenderMixin],

  getInitialState: function() {
    return { values: {} };
  },

  handleSubmit: function(e) {
    e.preventDefault();
    this.props.onSubmit(this.state.values);
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
