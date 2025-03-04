Example Lambdas
===============

Contains a few trivial example lambdas, mainly used to set up quick experiments.

Manually creating the empty Lambda function
-------------------------------------------

First, you need to manually create the lambda function in the target region. 
The name of the new function and the name of the zip file needs to match.


Building The Lambda Zip Files
-----------------------------

Add `.dont-add-npm-instana` file to the target folder to avoid adding the Instana npm packages and to use the layer instead.

Go to `cd packages/aws-lambda`.
Run `bin/create-zip.sh <lambda-folder-name>` to create deployment zip files for one of Lambda functions in this folder. The resulting zip files can be found in the `zip` subfolder. They can be uploaded to AWS as Lambda functions. There is also a script to deploy the resulting zip file via the `aws` command line tool.

The environment variable `BUILD_LAMBDAS_WITH` controls how the Lambda zip files are being built:

- `BUILD_LAMBDAS_WITH=npm bin/create-zip.sh <lambda-folder-name>`: Include the latest npm package `@instana/aws-lambda` (downloaded from the npm registry) in the zip file. This is the default if `BUILD_LAMBDAS_WITH` is not set.
- `BUILD_LAMBDAS_WITH=local bin/create-zip.sh <lambda-folder-name>`: Build a local tar.gz from the current content of `packages/aws-lambda` (by running `npm pack`) and include that in the zip file. Useful to test modifications that have not yet been published to npm.
- `BUILD_LAMBDAS_WITH=layer bin/create-zip.sh <lambda-folder-name>`: Do not add `@instana/aws-lambda` at all to the zip file, instead assume the Lambda function has the AWS Lambda layer "instana-nodejs" configured. Note: You still need to add the layer to the Lambda configuration, `bin/create-zip.sh` will not do this. The script `bin/deploy-zip.sh` will try to add or update the layer if it is asked to deploy a zip file that does not contain `@instana/aws-lambda`, though.


Deploying Lambda Zip Files
--------------------------

Before you deploy zip files, you need to actually build them, see above.

Use `bin/deploy-zip.sh <zip-file>` to deploy a Lambda zip files. They will be deployed to region `us-east-2` by default. You can repeat that step as often as you like if the Lambda code has changed or you want to deploy zip files with a more recent npm package/local package/Lambda layer.

If you have built the zip files with `BUILD_LAMBDAS_WITH=layer`, the script will try to add the Lambda layer "instana-nodejs" to the deployed Lambda function. The script will try to figure out the latest version of the Instana Node.js Lambda layer. Alternatively, you can also use `LAYER_VERSION` and `LAYER_ARN` to specifiy which layer you want to have added. Checkout the latest layers here: https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs

E.g. run something like `LAYER_VERSION=167 LAYER_ARN=arn:aws:lambda:ap-southeast-1:767398002385:layer:instana-nodejs:167 bin/deploy-zip.sh <zip-file>`.

Note that if you have use `BUILD_LAMBDAS_WITH=npm` or `BUILD_LAMBDAS_WITH=local` and the function already has the Instana Lambda layer, the deploy script will try to remove it and revert the handler back to `index.handler`.

Rebuild And Redeploy
--------------------
You can use `bin/rebuild-redeploy.sh <lambda-folder-name>` rebuild a Lambda zip file and immediately deploy it.

This script accepts the same environment variables as `bin/create-zip.sh` and `bin/deploy-zip.sh` (`BUILD_LAMBDAS_WITH`, `LAYER_VERSION`, `LAYER_ARN`, ...).

Deploy An Experimental Lambda Layer
-----------------------------------

You can use `bin/redeploy-experimental-layer-and-test-lambda.sh` to build the Lambda layer, deploy it under an experimental layer name, and also deploy the Lambda function `simple-nodejs-lambda` so that it uses that layer.
