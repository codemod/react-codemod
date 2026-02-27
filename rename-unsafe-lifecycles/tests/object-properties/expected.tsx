import createReactClass from "create-react-class";

const MyComponent = createReactClass({
  UNSAFE_componentWillMount: function() {
    console.log("mounting");
  },
  
  UNSAFE_componentWillReceiveProps: function(nextProps) {
    console.log("receiving props", nextProps);
  },
  
  render: function() {
    return <div>Hello</div>;
  }
});

export default MyComponent;
