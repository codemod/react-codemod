var React = require('react');

const render = () => {
  return /*1*/(
    /*2*/
    /*3*/
    /*4*/
    /*5*/
    /*6*/
    /*7*/
    /*8*/
    /*9*/
    /*10*/
    /*11*/
    /*12*/
    /*13*/
    /*14*/
    /*15*/
    /*16*/
    //17
    /*18*/
    /*19*/
    /*24*/
    //25
    <div className="foo" onClick={this.handleClick}>
        {
          (
                /*20*/
                /*21*/
                /*22*/
                /*23*/
                <TodoList.Item />
              )
        }
        {
          (
                /*26*/
                /*27*/
                <span {...getProps()} />
              )
        }
        {
          (
                /*28*/
                /*29*/
                <input />
              )
        }
      </div>
  );
};

const render2 = () => {
  return (
    // Prop comment.
    // Child string comment.
    <div className="foo">
        hello
      </div>
  );
};

const render3 = () => {
  return (
    // Child element comment.
    <div>
        <span />
      </div>
  );
};

const render4 = () => {
  return (
    /* No props to see here! */
    <Foo />
  );
};
