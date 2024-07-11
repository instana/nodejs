## ES Module Support for AWS Lambda

AWS Lambda began supporting ES modules with Node v14. Learn more on the [AWS Lambda ES modules and top-level await with Node.js 14](https://aws.amazon.com/about-aws/whats-new/2022/01/aws-lambda-es-modules-top-level-await-node-js-14/) page.

- **Current Issues (July 2024)**:
  - Defining an ES module as a handler in a Lambda layer is not supported at present. For updates, refer to AWS support case ID 172069954500883.

- **Current Workaround**:
  - We utilize the handler as a CommonJS module with dynamic imports.
  - Transitioning the handler to pure ES modules does not provide immediate benefits, but we are monitoring AWS updates closely.

- **Roadmap for Improvement**:
  - We've initiated an AWS support ticket (172069954500883) and engaged with the AWS SDK community to advocate for ES module support in Lambda layers.
  - Future plans for version 4.x include removing the `aws-lambda-auto-wrap` npm package and enhancing our deployment process by manually integrating necessary files during the layer publishing script.
  - Considering discontinuing support for Node.js version 14, which have reached the end of their LTS (Long-Term Support) lifecycle.