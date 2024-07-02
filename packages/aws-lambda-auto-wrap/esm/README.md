# ES Module support for AWS Lambda

The support for ES modules was added in Node v14.
See https://aws.amazon.com/about-aws/whats-new/2022/01/aws-lambda-es-modules-top-level-await-node-js-14/

But AWS forgot to add support for layers. There are currently two known bugs:

1. You cannot import an ES module, which is located in a layer. See https://github.com/vibe/aws-esm-modules-layer-support
2. You cannot define an ES module as handler, which is located in a layer. See AWS support case ID 11226031451.

We are affected by the second bug. When AWS fixes the underlying problem in their AWS runtime, we are able to transform the new esm handler into a real ES module.

For the time being, we are shipping the ES handler as a CommonJS module using dynamic imports as a workaround for Node.js 14 and 16, as AWS has yet to resolve the issue for these versions, which are no longer LTS.

## Future Plans in Version 4.x

- Removal of aws-lambda-auto-wrap: We plan to eliminate the dependency on the aws-lambda-auto-wrap npm package. Instead, we will manually copy over the necessary files during the publish layer script execution.

- Discontinuation of Support for Node.js 14 and 16: AWS has already dropped support for Node.js 14, and Node.js 16 is scheduled for deprecation.