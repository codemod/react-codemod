var React = require('react/addons');
var PureRenderMixin = React.addons.PureRenderMixin;

var TodoItem = React.createClass({
  displayName: 'TodoItem',

  propTypes: {
    id: React.PropTypes.string.isRequired,
    title: React.PropTypes.string,
    completed: React.PropTypes.bool,
    onToggle: React.PropTypes.func,
  },

  mixins: [PureRenderMixin],

  handleClick: function() {
    this.props.onToggle(this.props.id);
  },

  render: function() {
    var className = this.props.completed ? 'todo-item completed' : 'todo-item';
    return (
      <li className={className} onClick={this.handleClick}>
        {this.props.title}
      </li>
    );
  },
});

module.exports = TodoItem;
