import ReactDOM from "react-dom";

let renderedNode;

function mount(container) {
  renderedNode = ReactDOM.render(<App />, container);
  return renderedNode;
}
