#/usr/bash

cwd=$(pwd)

cd ../../
npm pack
mv instana-aws-lambda-*.tgz instana-aws-lambda.tgz
cd $cwd
npm i ../../$(echo instana-aws-lambda.tgz)

cd ../../../serverless
npm pack
mv instana-serverless-*.tgz instana-serverless.tgz
cd $cwd
npm i ../../../serverless/$(echo instana-serverless.tgz)

cd ../../../aws-lambda-auto-wrap
npm pack
mv instana-aws-lambda-auto-wrap-*.tgz instana-aws-lambda-auto-wrap.tgz
cd $cwd
npm i ../../../aws-lambda-auto-wrap/$(echo instana-aws-lambda-auto-wrap.tgz)
