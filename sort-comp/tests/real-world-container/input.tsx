var React = require('react');

var DataContainer = React.createClass({
  render: function() {
    return (
      <div className="data-container">
        {this.state.loading ? <span>Loading...</span> : this.props.children}
      </div>
    );
  },

  getInitialState: function() {
    return { loading: true };
  },

  defaultProps: {
    pollInterval: 5000,
  },

  componentDidMount: function() {
    this.fetchData();
  },

  fetchData: function() {
    var self = this;
    fetch(this.props.url).then(function(r) { return r.json(); }).then(function(data) {
      self.setState({ loading: false, data: data });
    });
  },

  propTypes: {
    url: React.PropTypes.string.isRequired,
    children: React.PropTypes.node,
  },
});

module.exports = DataContainer;
