# ----------------------------------------------------------------------------
# Modifications:
# - Use a Node.js base image instead of raw alpine.
# - Set latest DOCKER_VERSION=27.3.1
# https://docs.docker.com/engine/release-notes/27/
# Note: Needs to be run with --privileged.
#
# Note: Starting from Alpine 3.18, aws-cli v2 is available as a 'main' package,
# so we can install it directly using `apk add aws-cli`.
# https://pkgs.alpinelinux.org/packages?name=aws-cli
# ----------------------------------------------------------------------------

FROM node:22-alpine

ENV DOCKER_CHANNEL=stable \
    DOCKER_VERSION=27.3.1

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
        jq \
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
