Node.js Fargate Container Images
================================

This folder contains code to build and test the container image that is used by customers to monitor Node.js on Fargate/ECS.

There are three types of container images, each in their own sub folder:

* `inspector`: A simple Node.js application that inspects its surroundings. It prints environment variables and queries the ECS metadata server, then prints the resulting HTTP responses. When running this in a Fargate task, it provides valuable insight into what a live Fargate application has available. This mostly holds historical value, as `@instana/aws-fargate` is pretty feature complete. However, it could become useful again if new AWS Fargate runtime versions behave differently or make metadata available in a different way.
* `instana-aws-fargate`: This is the production base image that we provide to customers for monitoring Node.js Fargate tasks. The production image is published to `icr.io` (the public IBM Container Registry). This happens on our CI system, see `packages/serverless/ci/pipeline.yaml`. The [CI pipeline](https://ci.instana.io/teams/nodejs/pipelines/serverless-in-process-collectors:main/jobs/aws-fargate-nodejs-container-image-layer) uses the Dockerfile and package.json file in that folder, but not the build scripts `build.sh` or `build-and-push.sh`. These scripts are used to build variants of this image locally and to push them to a AWS ECR container registry, which is very useful for testing. Available scripts:
    * `instana-aws-fargate/build.sh` builds the Instana Node.js Fargate base image, either from your local sources or from an already published npm package.
    * `instana-aws-fargate/build-and-push.sh` builds the Instana Node.js Fargate base image and pushes it to a container image registry of your choice (usually our internal AWS ECS registry).
    * Both scripts each have documentation, explaining their purpose and the parameters they accept.
* `test-images`: The scripts in this folder can build various versions of a simple test application that uses the base image from `instana-aws-fargate`. Such an image basically represents a customer's application/Fargate task using our Node.js Fargate monitoring setup. Available scripts:
    * `test-images/build.sh`: Builds the test application image.
    * `test-images/build-and-push.sh`: Builds the test application image and pushes it to a registry.
    * `test-images/build-and-run.sh`: Builds the test application image and runs it locally.
    * All three scripts each have documentation, explaining their purpose and the parameters they accept.

How-To for Common Use Cases
---------------------------

### Initial Setup

- Copy `instana-aws-fargate/.env.template` to `instana-aws-fargate/.env`. Usually, no modification is necessary.
- Copy `test-images/.env.template` to `test-images/.env`. Just for building and pushing the test images, no modification is necessary. If you want to run the test images locally and report to an Instana environment, you need to configure a few things, which are documented in the `.env.template` file.
- Authenticate with the AWS ECR registry by executing `packages/aws-fargate/images/aws-ecr-login.sh`. This assumes that you have installed the [AWS CLI](https://aws.amazon.com/cli/) and have yourself via the AWS CLI. This step is only necessary if you want to push images to Instana's internal AWS ECR registry for test images.

**NOTE:** On AWS ECR, repositories are not auto-created with the first push, instead, they need to be created explicitly. When you are trying to push an image and `docker push` is printing `Retrying in $n seconds` behind the image layer hash without ever pushing anything, the most likely reason is that the image repository does not yet exist. Go the AWS ECR web UI to create a repository with the name you were trying to push and try again.

### Test the Current Release

* Run `test-images/build-and-push.sh` without arguments. This will build a test application container with the current latest production Instana Node.js Fargate container image layer and push it to our container registry for test images.

Then, use the AWS ECS web UI to include that image in a Fargate task and run it (see below).

### Test Your Local Modifications (not committed/pushed/released to npm yet)

* Run `test-images/build-and-push.sh local`. This will build an Instana Node.js Fargate container image layer from your local sources and use it to build a test image container as well, and finally push that to our container registry for test images.

Then, use the AWS ECS web UI to include that image in a Fargate task and run it (see below).

### Test A Specific npm Package (e. g. release candidate)

To test the latest `@instana/aws-fargate` package from the npm registry, refer to the section "Test the Current Release". The base image created there is based on the latest package from the npm registry.

However, sometimes you might want to test a package that does not have the dist-tag `latest`, for example a release candidate tagged with an npm dist-tag like `next`.

Build the base container image:

```
instana-aws-fargate/build-and-push.sh npm next

# ^
# "npm" is the build mode, that is, use a package from the npm registry
# "next" is the dist tag of the package you want to use. Any existing npm dist-tag can be used instead of "next".
```

Instead of running `instana-aws-fargate/build-and-push.sh`, you can also only run `instana-aws-fargate/build.sh` if you are not interested in pushing the image to a registry or if you want to verify it can be built correctly first.

With the default settings (default AWS ECR registry) you would find the image here: <https://us-east-2.console.aws.amazon.com/ecr/repositories/private/410797082306/instana-aws-fargate-nodejs?region=us-east-2>

Once the Instana Node.js Fargate base image with the release candidate has been created, you can create a test application image with it:

```
# Remember to provide an .env file in test-images, too.

test-images/build-and-push.sh aws 18 standard next
```

The first parameter (`aws`) specifies from where to fetch the Instana Node.js Fargate base image (in this case, from the AWS ECR registry instead of icr.io). The second parameter (`18`) specifies the Node.js version. The third parameter determines the Linux distribution to use (`standard` means Debian here). The last parameter, `next` refers to the Docker tag that has been applied to the Instana Node.js Fargate base image earlier, when building and pushing it. The tag `next` has been applied because that was the npm dist-tag that has been used. If you used a different dist-tag, you need to use that as the Docker tag here as well.

Finally, use the AWS ECS web UI to include that test application image in a Fargate task and run it (see below).

### Using the Image in a Fargate Task

You can find a list of all available images at <https://us-east-2.console.aws.amazon.com/ecr/repositories?region=us-east-2>. The test application image that you have created earlier (see above) should be here, too. Note down the name of the test application image, you will need it later.

* Go the list of task definitions <https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/taskDefinitions>
* Either create a new task definition from scratch, or
* update the existing `fargate-nodejs-test-task` by creating a new revision based on the last one.
* Scroll down to "Container definitions" section, click on the `fargate-nodejs-test-container` container name and paste the fully qualified image name into the "Image" field.
* You might want to check the "Environment" section in the container definition to see to which environment the task will report later.If no specific environment is defined, you will need to provide both the URL and the environment key.
* Go to clusters: <https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/clusters>
* Create a new cluster from scratch or use the existing [test cluster](https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/clusters/bastian-krol-test/services)
* Update the cluster's only service with the new task definition version by clicking "Update".
* Go to the [tasks tab](https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/clusters/bastian-krol-test/services/fargate-nodejs-service/tasks) and make sure that only the new task is running (old tasks might need to be stopped).
* Go to the Instana environment you are reporting to (for example [test/pink](https://test-instana.pink.instana.rocks/#/physical?q=entity.type%3Afargate)) and inspect the data.
* Test tracing:
    * You can find the task's public IP on its [details tab](https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/clusters/bastian-krol-test/tasks/7c75d3e7628743ba864a5d6d2ab6770e/details). The port (4816) is in the `test-images/server.js`)  file.
    * Execute a few requests: `watch curl http://$PUBLIC_TASK_IP:4816`.
    * Inspect the resulting calls in Instana.
