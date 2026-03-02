class TodoItem extends React.Component {
  constructor(props) {
    super(props);
    this.handleToggle = this.handleToggle.bind(this);
    this.handleDelete = this.handleDelete.bind(this);
  }

  handleToggle() {
    this.props.onToggle(this.props.id);
  }

  handleDelete() {
    this.props.onDelete(this.props.id);
  }

  render() {
    const { completed, text } = this.props;
    return (
      <li className={completed ? 'completed' : ''}>
        <input type="checkbox" checked={completed} onChange={this.handleToggle} />
        <span>{text}</span>
        <button onClick={this.handleDelete}>Delete</button>
      </li>
    );
  }
}
