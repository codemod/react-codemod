class BadExample extends React.Component {
  componentDidMount() {
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick() {
    this.setState({ clicked: true });
  }

  render() {
    return <button onClick={this.handleClick}>Click</button>;
  }
}
