var React = require('react');

var TabbedPanel = React.createClass({
  selectTab: function(tabId) {
    this.setState({ activeTab: tabId });
  },

  getActiveContent: function() {
    return this.props.tabs.find(function(t) { return t.id === this.state.activeTab; }.bind(this));
  },

  getInitialState: function() {
    return { activeTab: null };
  },

  statics: {
    defaultActiveIndex: 0,
  },

  propTypes: {
    tabs: React.PropTypes.array.isRequired,
  },

  render: function() {
    return <div className="tabbed-panel">{this.getActiveContent()}</div>;
  },
});

module.exports = TabbedPanel;
