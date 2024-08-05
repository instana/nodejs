# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021

FROM instana/aws-lambda-nodejs:latest as instana-layer

FROM public.ecr.aws/lambda/nodejs:14

COPY --from=instana-layer /opt/extensions/ /opt/extensions/
COPY --from=instana-layer /opt/nodejs/ /opt/nodejs/

COPY index.js package.json pnpm-lock.yaml /var/task/
WORKDIR /var/task
RUN npm install

# Set the CMD handler - could also be done as a parameter override outside of the Dockerfile, for example in the
# AWS console when configuring the Lambda function.
CMD [ "instana-aws-lambda-auto-wrap.handler" ]

