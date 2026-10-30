# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021

ARG NODEJS_VERSION
FROM public.ecr.aws/lambda/nodejs:${NODEJS_VERSION}

ARG NPM_VERSION
RUN npm install -g npm@${NPM_VERSION}

WORKDIR /opt
COPY tmp/ .

