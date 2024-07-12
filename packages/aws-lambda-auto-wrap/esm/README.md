## ES Module Support for AWS Lambda Layer

AWS Lambda began supporting ES modules with Node v14. Learn more on the [AWS Lambda ES modules and top-level await with Node.js 14](https://aws.amazon.com/about-aws/whats-new/2022/01/aws-lambda-es-modules-top-level-await-node-js-14/) page.

- **Current Issues (July 2024)**:
  - Defining an ES module as a handler in a Lambda layer is not supported at present. For updates, refer to AWS support case ID 172069954500883.

- **Current Workaround**:
  - We utilize the handler as a CommonJS module with dynamic imports.
  - Transitioning the handler to pure ES modules does not provide immediate benefits, but we are monitoring AWS updates closely.

- **Roadmap for Improvements**:
  - We've initiated an AWS support ticket (172069954500883) and engaged with the AWS SDK community to advocate for ES module support in Lambda layers. For more details, see the [GitHub discussion](https://github.com/aws/aws-sdk-js/discussions/4651).
  - In 4.x we will remove the `aws-lambda-auto-wrap` npm package, because this is an internal package. It got published by mistake. We copy the necessary files during the layer publishing script into the layer.
  - Considering discontinuing support for Node.js version 14, which has reached the end of their LTS (Long-Term Support) lifecycle.