var React = require('react');

var DataContainer = React.createClass({
  propTypes: {
    url: React.PropTypes.string.isRequired,
    children: React.PropTypes.node,
  },

  defaultProps: {
    pollInterval: 5000,
  },

  getInitialState: function() {
    return { loading: true };
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

  render: function() {
    return (
      <div className="data-container">
        {this.state.loading ? <span>Loading...</span> : this.props.children}
      </div>
    );
  },
});

module.exports = DataContainer;
