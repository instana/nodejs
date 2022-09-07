# AWS Lambda Runtime Emulator

## Prerequisite

Copy `.env.template` to `.env`.

Set at least these env variables:

```
image_tag_prefix=
container_name_prefix=
instana_endpoint_url=
instana_agent_key=
```

## Test an image with RIE included in the image

https://github.com/aws/aws-lambda-runtime-interface-emulator#test-an-image-with-rie-included-in-the-image

* Build & run using local layer: `./build-and-run.sh local`
* Build & run using released layer:  `./build-and-run.sh`
* Trigger function invocation: `./trigger.sh`

## Test an image without adding RIE to the image

https://github.com/aws/aws-lambda-runtime-interface-emulator#test-an-image-without-adding-rie-to-the-image

### Installing the RIE emulator locally

```sh
mkdir -p ~/.aws-lambda-rie && curl -Lo ~/.aws-lambda-rie/aws-lambda-rie \
https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie \
&& chmod +x ~/.aws-lambda-rie/aws-lambda-rie
```

### Building your lambda fn

```sh
cd packages/aws-lambda/lambdas/container-based
docker build -t myfunction:latest .
```

### Running your lambda function with the RIE emulator

```sh
docker run -d -v ~/.aws-lambda-rie:/aws-lambda  -e INSTANA_ENDPOINT_URL='AGENT_URL' -e INSTANA_AGENT_KEY='AGENT_KEY' -e INSTANA_DEBUG='true' -e AWS_LAMBDA_FUNCTION_TIMEOUT='900000' -p 9000:8080 myfunction:latest 
```

### Executing your lambda

```sh
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}'
```
