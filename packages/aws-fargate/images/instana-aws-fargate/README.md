FARGATE Container Build Howto

# FARGATE

When we do a NPM release, the Fargate container image is automatically published.
See `serverless/ci/pipeline.yml`. The images are published on `icr.io` (IBM Container Cloud).

https://ci.instana.io/teams/nodejs/pipelines/serverless-in-process-collectors:main/resources/instana-aws-fargate-npm-package

**NOTE: Releases do not use these folders (instana-aws-fargate, test-images)!
      These are only useful to simulate builds.** 

## Setup

- copy .env.temlate .env
- ecr_repository=410797082306.dkr.ecr.us-east-2.amazonaws.com
    - Copy from AWS UI

## Test remote npm package (release candidate)

First build the container only to see if it's working:

```
cd packages/aws-fargate/images/instana-aws-fargate
./build.sh npm next (any npm tag)
./build.sh npm (latest)
```

(npm = build mode)

We have to login at container registry in AWS, because otherwise we cannot push the docker image:

```
cd ..
./ecr-login.sh
```

You can now publish the image:

```
./build-and-push.sh npm next
```

Go here:
https://us-east-2.console.aws.amazon.com/ecr/repositories/private/410797082306/instana-aws-fargate-nodejs?region=us-east-2

This is the base image containing the instana version, fargate layer etc.

Now we want to build a test image containing the fargate application:

```
cd packages/aws-fargate/images/test-images
cp .env.template .env
```

```
./build.sh aws 12 standard next
./build-and-push.sh aws 12 standard next
```

https://us-east-2.console.aws.amazon.com/ecr/repositories?region=us-east-2

If you cannot push the image to AWS, you need to first create the repository!

If the image pops up:
https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/taskDefinitions

- create new revision based on the last one of fargate-nodejs-test-task
- change the container image to the new one
- check env variables to see where it reports to

Then:
- go to clusters: https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/clusters
- https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/clusters/bastian-krol-test/services
- Update the service with the new task definition version by clicking "Update"
- https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/clusters/bastian-krol-test/services/fargate-nodejs-service/tasks
    - ensure only the new task is running

Go to Pink
https://test-instana.pink.instana.rocks/#/physical?q=entity.type%3Afargate%20&snapshotId=dYPnS5dp3Pinv_4Rxsrzl3CvnN8

Send some requests to...


## Test local package

```
./build.sh local
```

(local = build mode)


