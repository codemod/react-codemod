const React = require('react');

module.exports = class Router extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hash: window.location.hash };
  }

  updateHash = (event) => {
    this.setState({ hash: window.location.hash });
  };
};
