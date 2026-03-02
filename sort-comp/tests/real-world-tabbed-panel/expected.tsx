var React = require('react');

var TabbedPanel = React.createClass({
  propTypes: {
    tabs: React.PropTypes.array.isRequired,
  },

  statics: {
    defaultActiveIndex: 0,
  },

  getInitialState: function() {
    return { activeTab: null };
  },

  getActiveContent: function() {
    return this.props.tabs.find(function(t) { return t.id === this.state.activeTab; }.bind(this));
  },

  selectTab: function(tabId) {
    this.setState({ activeTab: tabId });
  },

  render: function() {
    return <div className="tabbed-panel">{this.getActiveContent()}</div>;
  },
});

module.exports = TabbedPanel;
