ARG LAMBDA_BASE_IMAGE=public.ecr.aws/lambda/nodejs:18
ARG INSTANA_LAYER=icr.io/instana/aws-lambda-nodejs:latest

# add the Instana Lambda layer via the container image
FROM ${INSTANA_LAYER} as instana-layer

# add the official Lambda Node.js runtime image, see https://gallery.ecr.aws/lambda/nodejs -> Tab "Usage""
FROM ${LAMBDA_BASE_IMAGE}

# copy the Instana Lambda layer bits from the Instana base image
COPY --from=instana-layer /opt/extensions/ /opt/extensions/
COPY --from=instana-layer /opt/nodejs/ /opt/nodejs/

# Copy function code
# COPY esm/app.js ${LAMBDA_TASK_ROOT}
# COPY esm/package.json ${LAMBDA_TASK_ROOT}
COPY app.js ${LAMBDA_TASK_ROOT}

# Use `instana-aws-lambda-auto-wrap-esm` & esm/app.js when testing ES modules
# CMD [ "instana-aws-lambda-auto-wrap-esm.handler" ]
CMD [ "instana-aws-lambda-auto-wrap.handler" ]

