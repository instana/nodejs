# AWS Lambda + Layer Load Test

## Links

https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs#architecture-x8664

## Deploy released & test

This is helpful to test against the released behavior.
Uses the released layer, creates the zip and deploys the fn.

```sh
cd packages/aws-lambda
awstoken {verifyToken}
RELEASED=1 INSTANA_ENDPOINT_URL=... INSTANA_AGENT_KEY=... REGION=us-east-1 ./load-test/deploy.sh
RELEASED=1 node ./load-test/test.js
./load-test/cleanup.sh
```

## Deploy local & test

Publishes the local experimental lambda layer, creates the zip and deploys the fn.

```sh
cd packages/aws-lambda
awstoken {verifyToken}
INSTANA_ENDPOINT_URL=... INSTANA_AGENT_KEY=... REGION=us-east-1 ./load-test/deploy.sh
REGION=ap-east-1 node ./load-test/test.js
./load-test/cleanup.sh
```