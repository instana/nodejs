Node.js Google Cloud Run Container Images
=========================================

This folder contains code to build and test the container image that is used by customers to monitor Node.js on Google Cloud Run.

There are three types of container images, each in their own sub folder:

* `inspector`: A simple Node.js application that inspects its surrounding. It will print environment variables and query the Cloud Run metadata server, and print the resulting HTTP responses. When running this in a Google Cloud Run service, it gives valuable insight into what a live Google Cloud Run application has available. This has mostly historic value as `@instana/google-cloud-run` is pretty feature complete. However, it could become useful again if new Google Cloud Run runtime versions behave differently or make metadata available in a different way.
* `instana-google-cloud-run`: This is the production base image that we provide to customers to monitor Node.js Google Cloud Run services. The production image is published to `icr.io` (the public IBM Container Registry). This happens on our CI system, see `packages/serverless/ci/pipeline.yaml`. The [CI pipeline](https://ci.instana.io/teams/nodejs/pipelines/serverless-in-process-collectors:main/jobs/google-cloud-run-nodejs-container-image-layer) uses the Dockerfile and package.json file in that folder, but not the build scripts `build.sh` or `build-and-push.sh`. These scripts are used to build variants of this image locally and to push them to a Google Cloud Artifact registry, which is very usefull for testing. Available scripts:
    * `instana-google-cloud-run/build.sh` builds the Instana Node.js Google Cloud Run base image, either from your local sources or from an already published npm package.
    * `instana-google-cloud-run/build-and-push.sh` builds the Instana Node.js Google Cloud Run base image and pushes it to a container image registry of your choice.
    * Both scripts each have documentation, explaining their purpose and the parameters they accept.
* `test-images`: The scripts in this folder can build various versions of a simple test application that uses the base image from `instana-google-cloud-run`. Such an image basically represents a customer's application/Google Cloud Run service using our Node.js Google Cloud Run monitoring setup. Available scripts:
    * `test-images/build.sh`: Builds the test application image.
    * `test-images/build-and-push.sh`: Builds the test application image and pushes it to a registry.
    * `test-images/build-and-run.sh`: Builds the test application image and runs it locally.
    * All three scripts each have documentation, explaining their purpose and the parameters they accept.

How-To for Common Use Cases
---------------------------

### Initial Setup

- Copy `instana-google-cloud-run/.env.template` to `instana-google-cloud-run/.env`. Usually, no modification is necessary.
- Copy `test-images/.env.template` to `test-images/.env`. Just for building and pushing the test images, no modification is necessary. If you want to run the test images locally and report to an Instana environment, you need to configure a few things, which are documented in the `.env.template` file.

- Depending what you would like to achieve, you need to:
  - be authenticated against IBM Cloud to push BASE test images for icr.io (preferred)
  - be authenticated against Google Cloud platform to push images with test applications

### Test the Current Release

* Run `test-images/build-and-push.sh` without arguments. This will build a test application container with the current latest production Instana Node.js Google Cloud Run container image layer and push it to our container registry for test images.

Then, use the [Google Cloud web UI](https://console.cloud.google.com/run?project=k8s-brewery) to include that image in a Google Cloud Run service and run it (see below).

### Test Your Local Modifications (not committed/pushed/released to npm yet)

* Run `test-images/build-and-push.sh local`. This will build an Instana Node.js Google Cloud Run container image layer from your local sources and use it to build a test image container as well, and finally push that to our container registry for test images.

Then, use the [Google Cloud web UI](https://console.cloud.google.com/run?project=k8s-brewery) to include that image in a Google Cloud Run service and run it (see below).

### Test A Specific npm Package (e. g. release candidate)

To test the latest `@instana/google-cloud-run` package from the npm registry, refer to the section "Test the Current Release". The base image created there is based on the latest package from the npm registry.

However, sometimes you might want to test a package that does not have the dist-tag `latest`, for example a release candidate tagged with an npm dist-tag like `next`.

Build the base container image:

```
instana-google-cloud-run/build-and-push.sh npm next

# ^
# "npm" is the build mode, that is, use a package from the npm registry
# "next" is the dist tag of the package you want to use. Any existing npm dist-tag can be used instead of "next".
```

Instead of running `instana-google-cloud-run/build-and-push.sh`, you can also only run `instana-google-cloud-run/build.sh` if you are not interested in pushing the image to a registry or if you want to verify it can be built correctly first.

With the default settings (default Google Cloud Artifact registry) you would find the image here: <https://console.cloud.google/artifacts/docker/k8s-brewery/europe-west10/eu-west-tracers?csesidx=54336053&inv=1&invt=AbzTvg&project=k8s-brewery>

Once the Instana Node.js Google Cloud Run base image with the release candidate has been created, you can create a test application image with it:

```
# Remember to provide an .env file in test-images, too.

test-images/build-and-push.sh internal-icr 18 standard next
```

The first parameter (`gcr`) specifies from where to fetch the Instana Node.js Google Cloud Run base image (in this case, from the Google Cloud Artifact registry instead of icr.io). The second parameter (`18`) specifies the Node.js version. The third parameter determines the Linux distribution to use (`standard` means Debian here). The last parameter, `next` refers to the Docker tag that has been applied to the Instana Node.js Google Cloud Run base image earlier, when building and pushing it. The tag `next` has been applied because that was the npm dist-tag that has been used. If you used a different dist-tag, you need to use that as the Docker tag here as well.

Finally, use the [Google Cloud web UI](https://console.cloud.google.com/run?project=k8s-brewery) to include that image in a Google Cloud Run service and run it (see below).

### Using the Image in a Google Cloud Run Service

You can find a list of all available images at <https://console.cloud.google.com/gcr/images/k8s-brewery/global/cloud-run/nodejs?project=k8s-brewery>. The test application image that you have created earlier (see above) should be here, too.

* Go the list of Google Cloud Run services: <https://console.cloud.google.com/run?project=k8s-brewery>
* Either create a new service from scratch, or
* update the existing [`cloud-run-nodejs-test`](https://console.cloud.google.com/run/detail/us-central1/cloud-run-nodejs-test/metrics?project=k8s-brewery) by creating a new revision (by clicking on "Edit & Deploy new revision).
* In the "General" tab/"Container image URL", select the image you want to use for the test.
* You might want to check the "Environmnt variables" section in the "Variables & Secrets" tab to see to which environmnt the service will report later.
* Click on "Deploy". The old revision will automatically be decommissioned and the new one will take over.
* Go to the Instana environment you are reporting to (for example [test/pink](https://test-instana.pink.instana.rocks/#/physical?q=entity.type%3Acloudrun)) and inspect the data.
* Test tracing:
    * You can find the service's public URL on its [details tab](https://console.cloud.google.com/run/detail/us-central1/cloud-run-nodejs-test/general?project=k8s-brewery).
    * Execute a few requests: `watch curl https://$PUBLIC_SERVICE_URL`.
    * Inspect the resulting calls in Instana.
