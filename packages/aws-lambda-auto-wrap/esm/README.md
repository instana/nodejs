# ES Module support for AWS Lambda

The support for ES modules was added in Node v14.
See https://aws.amazon.com/about-aws/whats-new/2022/01/aws-lambda-es-modules-top-level-await-node-js-14/

But AWS forgot to add support for layers. There are currently two known bugs:

1. You cannot import an ES module, which is located in a layer. See https://github.com/vibe/aws-esm-modules-layer-support
2. You cannot define an ES module as handler, which is located in a layer. See AWS support case ID 11226031451.

We are affected by the second bug. When AWS fixes the underlying problem in their AWS runtime, we are able to transform the new esm handler into a real ES module.

For now: We ship the ES handler as commonjs module with the help of dynamic imports.

In version 4.x, we will remove the aws-lambda-auto-wrap npm package and manually copy over the files in the publish layer script. Additionally, we can drop support for Node.js 14 and 16, which are no longer LTS.