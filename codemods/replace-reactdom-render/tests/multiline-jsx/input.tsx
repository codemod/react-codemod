import * as ReactDOM from "react-dom";

function show(container) {
    ReactDOM.render(
      <NotifyContent
        isIn={false}
        text={text}
        status={status}
      />,
      container
    );
}
