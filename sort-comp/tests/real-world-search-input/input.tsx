var React = require('react');

var SearchInput = React.createClass({
  handleClear: function() {
    this.setState({ value: '' });
  },

  handleChange: function(e) {
    this.setState({ value: e.target.value });
  },

  getInitialState: function() {
    return { value: '' };
  },

  componentDidMount: function() {
    this.inputRef.focus();
  },

  propTypes: {
    placeholder: React.PropTypes.string,
    onSearch: React.PropTypes.func,
  },

  render: function() {
    return (
      <div className="search-input">
        <input
          ref={(el) => { this.inputRef = el; }}
          value={this.state.value}
          onChange={this.handleChange}
          placeholder={this.props.placeholder}
        />
        {this.state.value && (
          <button onClick={this.handleClear} aria-label="Clear">×</button>
        )}
      </div>
    );
  },
});

module.exports = SearchInput;
