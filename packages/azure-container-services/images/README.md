Node.js Azure Container Images
================================

This folder contains code to build and test the container image that is used by customers to monitor Node.js on Azure.

There are two types of container images, each in their own sub folder:

* `instana-azure-container-services`: This is the production base image that we provide to customers for monitoring Node.js Azure container services. The production image is published to `icr.io` (the public IBM Container Registry). This happens on our CI system, see `packages/serverless/ci/pipeline.yaml`. The [CI pipeline](https://ci.instana.io/teams/nodejs/pipelines/serverless-in-process-collectors:main/jobs/azure-container-services-nodejs-container-image-layer) uses the Dockerfile and package.json file in that folder, but not the build scripts `build.sh` or `build-and-push.sh`. These scripts are used to build variants of this image locally and to push them to a Azure container registry, which is very useful for testing. Available scripts:
    * `instana-azure-container-services/build.sh` builds the Instana Node.js Azure base image, either from your local sources or from an already published npm package.
    * `instana-azure-container-services/build-and-push.sh` builds the Instana Node.js Azure base image and pushes it to a container image registry of your choice (usually our internal Azure container registry).
    * Both scripts each have documentation, explaining their purpose and the parameters they accept.
* `test-images`: The scripts in this folder can build various versions of a simple test application that uses the base image from `instana-azure-container-services`. Such an image basically represents a customer's application/Azure container service using our Node.js Azure monitoring setup. Available scripts:
    * `test-images/build.sh`: Builds the test application image.
    * `test-images/build-and-push.sh`: Builds the test application image and pushes it to a registry.
    * `test-images/build-and-run.sh`: Builds the test application image and runs it locally.
    * All two scripts each have documentation, explaining their purpose and the parameters they accept.

How-To for Common Use Cases
---------------------------

### Initial Setup

- Copy `instana-azure-container-services/.env.template` to `instana-azure-container-services/.env`. Usually, no modification is necessary.
- Copy `test-images/.env.template` to `test-images/.env`. Just for building and pushing the test images, no modification is necessary. If you want to run the test images locally and report to an Instana environment, you need to configure a few things, which are documented in the `.env.template` file.
- Authenticate with the Azure container registry by executing `packages/azure-container-services/images/azure-registry-login.sh`. This assumes that you have installed the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/) and have yourself via the Azure CLI. This step is only necessary if you want to push images to Instana's internal Azure container registry for test images.

### Test the Current Release

* Run `test-images/build-and-push.sh` without arguments. This will build a test application container with the current latest production Instana Node.js Azure container image and push it to our container registry for test images.

Then, use the Azure web portal to include that image in a Azure container service and run it (see below).

### Test Your Local Modifications (not committed/pushed/released to npm yet)

* Run `test-images/build-and-push.sh local`. This will build an Instana Node.js Azure container image layer from your local sources and use it to build a test image container as well, and finally push that to our container registry for test images.

Then, use the Azure web UI to include that image in a Azure container service and run it (see below).

### Test A Specific npm Package (e. g. release candidate)

To test the latest `@instana/azure-container-services` package from the npm registry, refer to the section "Test the Current Release". The base image created there is based on the latest package from the npm registry.

However, sometimes you might want to test a package that does not have the dist-tag `latest`, for example a release candidate tagged with an npm dist-tag like `next`.

Build the base container image:

```
instana-azure-container-services/build-and-push.sh npm next

# ^
# "npm" is the build mode, that is, use a package from the npm registry
# "next" is the dist tag of the package you want to use. Any existing npm dist-tag can be used instead of "next".
```

Instead of running `instana-azure-container-services/build-and-push.sh`, you can also only run `instana-azure-container-services/build.sh` if you are not interested in pushing the image to a registry or if you want to verify it can be built correctly first.

With the default settings (default Azure container registry) you would find the image here: Azure portal: https://portal.azure.com and go to the Azure Container Registry service

Once the Instana Node.js Azure base image with the release candidate has been created, you can create a test application image with it:

```
# Remember to provide an .env file in test-images, too.

test-images/build-and-push.sh azure 18 standard next
```

The first parameter (`azure`) specifies from where to fetch the Instana Node.js Azure base image (in this case, from the Azure container registry instead of icr.io). The second parameter (`18`) specifies the Node.js version. The third parameter determines the Linux distribution to use (`standard` means Debian here). The last parameter, `next` refers to the Docker tag that has been applied to the Instana Node.js Azure base image earlier, when building and pushing it. The tag `next` has been applied because that was the npm dist-tag that has been used. If you used a different dist-tag, you need to use that as the Docker tag here as well.

Finally, use the Azure web UI to include that test application image in a Azure container service and run it (see below).

### Using the Image in a Azure Container Service

* Navigate to Azure Container Registry (ACR):

Access the Azure portal: https://portal.azure.com and go to the Azure Container Registry service.
* Choose the Azure Container Registry where your Docker image is stored and copy Container Image URL.
* Go to the Azure Container Instances service: https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerInstance%2FcontainerGroups. Create a New Container Group or Update an Existing One.
* In the "Basics" tab, provide a name, region, and resource group for the container group.
In the "Containers" tab, add a new container, paste the previously copied container image URL, and configure necessary settings like ports and environment variables.
Deploy the Container Group.
* Click on "Review + create" and then "Create" to deploy the container group.
Access the Container Group:

* Once deployed, you can access the container group's details and obtain the public IP address or DNS name to access your application.
* Go to the Instana environment you are reporting to (for example [test/pink](https://test-instana.pink.instana.rocks/#/physical?q=entity.type%3Acloudrun)) and inspect the data.
* Test tracing:
    * You can find the service's public URL on its [details tab](https://console.cloud.google.com/run/detail/us-central1/cloud-run-nodejs-test/general?project=k8s-brewery).
    * Execute a few requests: `watch curl https://$PUBLIC_SERVICE_URL`.
    * Inspect the resulting calls in Instana.