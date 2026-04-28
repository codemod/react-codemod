const ReactDOM = require("react-dom");
const { useActionState } = require('react');

const [state, action] = useActionState(reducer, initialState);
