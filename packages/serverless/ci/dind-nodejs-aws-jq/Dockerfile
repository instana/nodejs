# ----------------------------------------------------------------------------
# Loosely based on
#
# https://github.com/karlkfi/concourse-dcind/blob/477674e4a27d79fa62099a86aa032017d4292d12/Dockerfile
#
# Modifications:
# - Use a Node.js base image instead of raw alpine.
# - Set DOCKER_VERSION=20.10.11
#
# Note: Needs to be run with --privileged.
#
# Note: Starting from Alpine 3.18, aws-cli v2 is available as a 'main' package,
# so you can install it directly using `apk add aws-cli`.
# ----------------------------------------------------------------------------

FROM node:20-alpine

# Environment variables for Docker 
ENV DOCKER_CHANNEL=stable \
    DOCKER_VERSION=20.10.11

# Install necessary packages and Docker
RUN apk --update --no-cache add \
        bash \
        ca-certificates \
        cargo \
        curl \
        device-mapper \
        gcc \
        iptables \
        libc-dev \
        libffi-dev \
        make \
        musl-dev \
        openssl-dev \
        util-linux \
        zip \
    && apk upgrade \
    && curl -fL "https://download.docker.com/linux/static/${DOCKER_CHANNEL}/x86_64/docker-${DOCKER_VERSION}.tgz" | tar zx \
    && mv /docker/* /bin/ \
    && chmod +x /bin/docker* \
    && rm -rf /var/cache/apk/* /root/.cache

# Install AWS CLI
RUN apk add --no-cache aws-cli

COPY entrypoint.sh /bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
