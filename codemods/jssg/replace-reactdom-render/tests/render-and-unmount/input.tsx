import * as ReactDOM from "react-dom";

function mount(container) {
  ReactDOM.render(<App />, container);
}

function cleanup(container) {
  ReactDOM.unmountComponentAtNode(container);
}
