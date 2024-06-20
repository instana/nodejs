# ES Module support for AWS Lambda

The support for ES modules was added in Node v14.
See https://aws.amazon.com/about-aws/whats-new/2022/01/aws-lambda-es-modules-top-level-await-node-js-14/

But AWS forgot to add support for layers. There are currently two known bugs:

1. You cannot import an ES module, which is located in a layer. See https://github.com/vibe/aws-esm-modules-layer-support
2. You cannot define an ES module as handler, which is located in a layer. See AWS support case ID 11226031451.

We are affected by the second bug. When AWS fixes the underlying problem in their AWS runtime, we are able to transform the new esm handler into a real ES module.

For the time being, we are shipping the ES handler as a CommonJS module using dynamic imports as a workaround for Node.js 14 and 16, as AWS has yet to resolve the issue for these versions, which are no longer LTS.
see the comment https://github.com/aws/aws-sdk-js-v3/issues/3230#issuecomment-1561973247

The Node.js 18.x runtime introduces support for ES module resolution using NODE_PATH. For more information, refer to [Node.js 18.x runtime now available in AWS Lambda](https://aws.amazon.com/blogs/compute/node-js-18-x-runtime-now-available-in-aws-lambda/). This is the recommended workaround.

In version 4.x, we will remove the aws-lambda-auto-wrap npm package and manually copy over the files in the publish layer script. Additionally, we can drop support for Node.js 14 and 16, as the issue will be resolved with version 18.