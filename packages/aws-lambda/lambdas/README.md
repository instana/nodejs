Example Lambdas And Lambda Demo
===============================

Contains a few trivial example lambdas, mainly used to set up quick experiments. It also contains the Instana AWS Lambda demo (see below).


Building The Lambda Zip Files
-----------------------------

Run `bin/create-zips.sh` to create zip files for each of Lambdas. The resulting zip files can be found in the `zip` subfolder, they can be uploaded to AWS as Lambda definitions. There is also a script to deploy the demo Lambda function via the `aws` command line tool. You can also build individual zip files, each Lambda has its own `${lambda-folder}/bin/create-zip.sh` script.

The environment variable `BUILD_LAMBDAS_WITH` controls how the Lambda zip files are being built:

- `BUILD_LAMBDAS_WITH=npm bin/create-zips.sh`: Include the latest npm package `@instana/aws-lambda` (downloaded from the npm registry) in the zip file. This is the default if `BUILD_LAMBDAS_WITH` is not set.
- `BUILD_LAMBDAS_WITH=local bin/create-zips.sh`: Build a local tar.gz from the current content of `packages/aws-lambda` (by running `npm pack`) and include that in the zip file. Useful to test modifications that have not yet been published to npm.
- `BUILD_LAMBDAS_WITH=layer bin/create-zips.sh`: Do not add `@instana/aws-collector` at all to the zip file, instead assume the Lambda function has the AWS Lambda layer "instana" configured. Note: You still need to add the layer to the Lambda configuration, `bin/create-zips.sh` will not do this. The script `bin/deploy-demo.sh` will try to add or update the layer if it is asked to deploy a zip file that does not contain `@instana/aws-collector`, though.