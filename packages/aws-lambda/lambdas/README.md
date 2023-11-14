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


The AWS Lambda Demo
-------------------

The AWS Lambda demo is comprised of all Lambda functions in this folder prefixed with `demo-`. The Node.js app `plain-ec2-app` is also part of the demo, although it is not a Lambda function. The full setup also includes
* an Instana agent running in AWS monitoring mode that provides infrastructure data about the Lambda functions – with the correct credentials for monitoring the region the demo Lambdas are running in (usually deployed on an EC2 instance, see [Installing the Agent on AWS](https://www.ibm.com/docs/de/obi/current?topic=agents-monitoring-amazon-web-services-aws) in the Instana documentation),
* an RDS PostgreSQL database (see below),
* an S3 bucket named `instana-lambda-demo` in the same region, and
* a Node.js/Express app (`plain-ec2-app`) deployed "somewhere" (for example on the EC2 instance that runs the agent).


### Initial Setup

To set up the demo initially for a new AWS account, go to https://us-east-2.console.aws.amazon.com/lambda/home?region=us-east-2#/functions (link might be different depending on the region you want to deploy to). Create four Lambda functions with the names from the list below. Choose the `Node.js 18` runtime. Each function will need the `INSTANA_ENDPOINT_URL` and `INSTANA_AGENT_KEY` environment variable as outlined in our documentation. Some functions need additional environment variables to know where to reach the other components they talk to.

* `demo-cloudwatch-events-processor`
    * `RDS_HOSTNAME` (mandatory)
    * `RDS_PORT` (optional, default `5432`)
    * `RDS_DB_NAME` (optional, default `lambdademo`)
    * `RDS_USERNAME` (optional, default `postgres`)
    * `RDS_PASSWORD` (mandatory)
* `demo-http-api`
    * `RDS_HOSTNAME` (mandatory)
    * `RDS_PORT` (optional, default `5432`)
    * `RDS_DB_NAME` (optional, default `lambdademo`)
    * `RDS_USERNAME` (optional, default `postgres`)
    * `RDS_PASSWORD` (mandatory)
    * `AUDIT_LOG_SERVICE_URL` (mandatory, use the public URL of the non-Lambda Node.js app, see below)
* `demo-s3-watcher`
    * `RDS_HOSTNAME` (mandatory)
    * `RDS_PORT` (optional, default `5432`)
    * `RDS_DB_NAME` (optional, default `lambdademo`)
    * `RDS_USERNAME` (optional, default `postgres`)
    * `RDS_PASSWORD` (mandatory)
* `demo-trigger`
    * `API_URL` (mandatory, provide the public base URL of the API gateway (see below))
    * `BUCKET_NAME` (optional, default `instana-lambda-demo`)

### AWS Trigger and API Setup

The demo needs a few more things set up on AWS:
- Connect a CloudWatch Events trigger to `demo-trigger`, so that the functions gets called regularly (like, once a minute). This then triggers a bunch of other calls to other Lambdas etc. which will all end up in one trace. Just clicking the "Test" button in the `demo-trigger` configuration page will also kick of a trace.
- Connect a CloudWatch Events trigger to `demo-cloudwatch-events-processor`, maybe with a lower frequency (like every five minutes).
- Create an S3 bucket named `instana-lambda-demo` in the same region.
- Add an S3 trigger to `demo-s3-watcher` that watches for `ObjectCreatedNotification` events (also called "All object create events" in the AWS UI) in `instana-lambda-demo` bucket.
- Add an API Gateway trigger to `demo-http-api` with two resources and one `ANY` method per resource:
    - API endpoint/resource: /items
        - Authorization: NONE
        - Method: ANY
            - Integration Type: Lambda Function
            - Use Lambda Proxy integration: Yes
            - Lambda Function: select the `demo-http-api` function here.
    - API endpoint/resource: /items/{itemId}
        - Authorization: NONE
        - Method: ANY
            - Integration Type: Lambda Function
            - Use Lambda Proxy integration: Yes
            - Lambda Function: select the `demo-http-api` function here.
    - Note down the public base URL of this API Gateway (should be something like `https://some-id.execute-api.region.amazonaws.com/default`). This needs to be provided as the `API_URL` to `demo-trigger`.

#### Database Setup

Create an PostgreSQL RDS database and make it accessible from your Lambdas and the EC2 host where `plain-ec2-app` runs. (Since it is only a demo app and the database is still password protected you might consider making it publicly accessible.) Note down the URL given as the "Endpoint" in the AWS web UI, should be something like `$db-name.$some-id.$region.rds.amazonaws.com`. This needs to be provided as `RDS_HOSTNAME` to some of the Lambdas.

Install a PostgreSQL client and run the following commands:

```bash
psql --host ${your RDS endpoint} --user postgres --password
Password:

CREATE DATABASE lambdademo owner postgres;

\c lambdademo

CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, label VARCHAR NOT NULL CHECK (label <> ''), timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS audit_log (id SERIAL PRIMARY KEY, message VARCHAR, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW());
```

#### Non-Lambda Node.js App Setup

In additon to the four Lambda functions the demo also involves a non-Lambda Node.js app. The sources for this app are in `plain-ec2-app`. Since this app talks HTTPS it needs a keypair. Before you deploy this app to a new server for the first time, you need to generate a matching self signed cert for that server.  Take a look at `plain-ec2-app/generate-key-pair.sh`, in particular at the comments at the top of the script. You will need to edit the host name in two places and then run the script.

The script `bin/create-zips.sh` also creates a zip file for the non-Lambda Node.js app as `zip/demo-ec2-app.zip`. If you have just generated a new cert you need to recreate that zip before deploying it (`plain-ec2-app/bin/create-zip.sh` to only recreate that one zip file).

To deploy the zip, upload it to an EC2 instance (or wherever you want to deploy the app). Log in to the target host and follow these steps (we assume Amazon Linux 2 or another yum based distro, otherwise YMMV):

```
sudo yum install -y gcc-c++ make   # required to compile native Node.js addons

curl -sL https://rpm.nodesource.com/setup_18.x | sudo -E bash -
sudo yum install -y nodejs
mkdir /opt/demo-app
cp /tmp/demo-ec2-app.zip /opt/demo-app/
cd /opt/demo-app
unzip demo-ec2-app.zip
npm install
cp .env.template .env
vim .env                # see comments in .env file
bin/start.sh
```

If you are running this on the same machine that the AWS agent (see above) is running on, you need to enable tracing (an AWS agent does not trace by default):

* `vim /opt/instana/agent/etc/instana/com.instana.agent.main.config.Agent.cfg`
* Change the mode to `mode = APM`, save and restart the agent service.

If you have deploy the app somewhere else, please also deploy an Instana agent that is configured for tracing.

Make sure the app can be reached from the public internet. Its URL needs to be provided as `AUDIT_LOG_SERVICE_URL` to some of the demo Lambda functions (see above).

### Deploying The Demo Lambda Zip Files

Before you deploy zip files, you need to actually build them, see above.

Use `bin/deploy-demo.sh` to deploy all four demo Lambda zip files. They will be deployed to region `us-east-2` by default. You can repeat that step as often as you like if the Lambda code has changed or you want to deploy zip files with a more recent npm package/local package.

If you have built the zip files with `BUILD_LAMBDAS_WITH=layer`, the script will try to add the Lambda layer "instana-nodejs" to the deployed Lambda functions. The script will try to figure out the latest version of the Instana Node.js Lambda layer. Alternatively, you can also use `LAYER_VERSION` and `LAYER_ARN` to specifiy which layer you want to have added. Checkout the latest layers here: https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs

E.g. run something like `LAYER_VERSION=167 LAYER_ARN=arn:aws:lambda:ap-southeast-1:410797082306:layer:instana-nodejs:167 bin/deploy-demo.sh`.

Note that if you have use `BUILD_LAMBDAS_WITH=npm` or `BUILD_LAMBDAS_WITH=local` and the function already has the Instana Lambda layer, the deploy script will try to remove it and revert the handler back to `index.handler`.

If, instead of deploying the demo (consisting of the Lambdas `demo-trigger`, `demo-http-api`, and `demo-s3-watcher`) you just want to deploy a single Lambda function from the `packages/aws-lambda/lambdas` folder, you can use `bin/rebuild-redeploy-single.sh`. That script accepts the same environment variables as `bin/deploy-demo.sh` (`LAYER_VERSION`, `LAYER_ARN`, ...).

### Rerouting the Demo Traffic

You can use `bin/reroute.sh` to quickly change the environment variables `INSTANA_ENDPOINT_URL` and `INSTANA_AGENT_KEY` for all demo Lambda functions at once. Call it like this:

`NEW_INSTANA_ENDPOINT_URL=... NEW_INSTANA_AGENT_KEY=... bin/reroute.sh`

Do not forget to also change the configuration of the agent monitoring the Lambdas infrastructure-wise and the Node.js app – this needs to be done manually.

