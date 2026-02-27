import createReactClass from "create-react-class";

const MyComponent = createReactClass({
  componentWillMount: function() {
    console.log("mounting");
  },
  
  componentWillReceiveProps: function(nextProps) {
    console.log("receiving props", nextProps);
  },
  
  render: function() {
    return <div>Hello</div>;
  }
});

export default MyComponent;
