var React = require('react');

var SettingsPanel = React.createClass({
  getInitialState: function() {
    return { expanded: false };
  },

  toggle: function() {
    this.setState({ expanded: !this.state.expanded });
  },

  render: function() {
    return (
      <div>
        <button onClick={this.toggle}>{this.state.expanded ? 'Collapse' : 'Expand'}</button>
        {this.state.expanded && <div className="settings-content">{this.props.children}</div>}
      </div>
    );
  },

  propTypes: {
    children: React.PropTypes.node,
  },
});

module.exports = SettingsPanel;
