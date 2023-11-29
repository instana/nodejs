Node.js Azure Container Images
================================

There are two distinct container image types, each in their own sub folder:

* `instana-azure-container-services`: This folder contains the production base image that we provide to customers for monitoring Node.js Azure container services. The production image is published to icr.io, which is the public IBM Container Registry. This happens on our CI system, see `packages/serverless/ci/pipeline.yaml`. The [CI pipeline](https://ci.instana.io/teams/nodejs/pipelines/serverless-in-process-collectors:main/jobs/azure-container-services-nodejs-container-image-layer) uses the Dockerfile and package.json file in that folder, but not the build scripts `build.sh` or `build-and-push.sh`. These scripts are used to build variants of this image locally and to push them to a Azure container registry, which is very useful for testing. Available scripts:
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

### Requirements

- Azure Account: Ensure you have access to an Azure account for deploying and testing container images.
- Azure CLI: Install the Azure CLI for authentication and azure operations.
- Docker: Make sure Docker is installed for building container images locally.


### Initial Setup

- Copy `instana-azure-container-services/.env.template` to `instana-azure-container-services/.env`. Usually, no modification is necessary.
- Copy `test-images/.env.template` to `test-images/.env`. Just for building and pushing the test images, no modification is necessary. If you want to run the test images locally and report to an Instana environment, you need to configure a few things, which are documented in the `.env.template` file.
- Authenticate with the Azure container registry by executing `packages/azure-container-services/images/azure-registry-login.sh`. This step is only necessary if you want to push images to Instana's internal Azure container registry for test images. If you want to push your test images to another registry please replace that in the script azure-registry-login.sh.

### Test the Current Release

* Run `test-images/build-and-push.sh` without arguments. This will build a test application container with the current latest production Instana Node.js Azure container image and push it to our container registry for test images.

Then, use the Azure web portal to include that image in a Azure container services and run it (see below).

### Test Your Local Modifications (not committed/pushed/released to npm yet)

* Run `test-images/build-and-push.sh local`. This will build an Instana Node.js Azure container image layer from your local sources and use it to build a test image container as well, and finally push that to our container registry for test images.

Then, use the Azure web portal to include that image in a Azure container service and run it (see below).

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

With the default settings (default Azure container registry) you would find the image here: Azure Container Registry service: https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerRegistry%2Fregistries

Once the Instana Node.js Azure base image with the release candidate has been created, you can create a test application image with it:

```
test-images/build-and-push.sh azure 18 standard next
```

The first parameter (`azure`) specifies from where to fetch the Instana Node.js Azure base image (in this case, from the Azure container registry instead of icr.io). The second parameter (`18`) specifies the Node.js version. The third parameter determines the Linux distribution to use (`standard` means Debian here). The last parameter, `next` refers to the Docker tag that has been applied to the Instana Node.js Azure base image earlier, when building and pushing it. The tag `next` has been applied because that was the npm dist-tag that has been used. If you used a different dist-tag, you need to use that as the Docker tag here as well.

Finally, use the Azure web portal to include that test application image in a Azure container service and run it (see below).

### Using the Image in a Azure App Service

* Navigate to the Azure portal at https://portal.azure.com.
* Access the Azure app service by visiting https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Web%2Fsites and create a new web app.
* Fill in the required information in the "Basics" tab, including the name, region, and choose the docker container as the 'Publish' option.
* Head to the "Docker" tab, enter the Docker image details, select the Azure Container Registry where your Docker image is stored, and choose the specific Docker image.
* Click on "Review + create" and then proceed to click "Create" to initiate the deployment of the Azure web app.
* After deployment, access the app service details to find the public IP address or DNS name for accessing your application.
* In the "Configuration" section of the web app, enter the Instana URL and environment key to specify the environment to which the app will report later. If no specific environment is defined, include both the URL and the environment key in the application settings.
* Go to the Instana environment you are reporting to (for example [test/pink](https://test-instana.pink.instana.rocks/#/physical?q=entity.type%3Acloudrun)) and inspect the data.
* Test tracing:
    * You can find the service's public URL on its [details tab](https://console.cloud.google.com/run/detail/us-central1/cloud-run-nodejs-test/general?project=k8s-brewery).
    * Execute a few requests: `watch curl https://$PUBLIC_SERVICE_URL`.
    * Inspect the resulting calls in Instana.