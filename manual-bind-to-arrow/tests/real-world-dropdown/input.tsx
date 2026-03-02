class Dropdown extends React.Component {
  constructor() {
    super();
    this.toggle = this.toggle.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
  }

  componentDidMount() {
    document.addEventListener('click', this.handleOutsideClick);
  }

  componentWillUnmount() {
    document.removeEventListener('click', this.handleOutsideClick);
  }

  toggle() {
    this.setState({ open: !this.state.open });
  }

  handleOutsideClick(e) {
    if (this.refs.dropdown && !this.refs.dropdown.contains(e.target)) {
      this.setState({ open: false });
    }
  }

  render() {
    return (
      <div ref="dropdown">
        <button onClick={this.toggle}>Menu</button>
        {this.state.open && <ul className="dropdown-menu">{this.props.children}</ul>}
      </div>
    );
  }
}
