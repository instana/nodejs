# ----------------------------------------------------------------------------
# Loosely based on
#
# https://github.com/karlkfi/concourse-dcind/blob/477674e4a27d79fa62099a86aa032017d4292d12/Dockerfile
#
# Modifications:
# - Use a Node.js base image instead of raw alpine,
# - add glibc because the AWS cli requires that (does not work with muslc)
# - Updated DOCKER_VERSION to the latest stable release
# - Updated GLIBC_VER to the latest stable release
# - removed docker-compose and some related packages (py-pip, python3-dev)
# - removed docker squash support,
# - added jq, and
# - added/removed a bunch apk packages.
#
# Note: Needs to be run with --privileged.
# ----------------------------------------------------------------------------

FROM node:18-alpine

ENV DOCKER_CHANNEL=stable \
    DOCKER_VERSION=24.0.9 \
    GLIBC_VER=2.35-r0

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
        && \
    apk upgrade && \
    curl -fL "https://download.docker.com/linux/static/${DOCKER_CHANNEL}/x86_64/docker-${DOCKER_VERSION}.tgz" | tar zx && \
    mv /docker/* /bin/ && chmod +x /bin/docker* && \
    rm -rf /var/cache/apk/* && \
    rm -rf /root/.cache

# Install glibc compatibility for alpine plus AWS cli
# ----------------------------------------------------------------------------
# This section installs the latest version of AWS CLI (v2) and glibc.
# AWS CLI v2 is fetched directly from Amazon’s servers using a static
# download link, which always provides the latest release of the CLI tool.
# https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html#getting-started-install-instructions
ARG ALPINE_GLIBC_REPO="https://github.com/sgerrand/alpine-pkg-glibc/releases/download"
RUN apk --no-cache add \
        --virtual .build-deps curl binutils zstd gcompat \
    && curl -LfsS https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub -o /etc/apk/keys/sgerrand.rsa.pub \
    && curl -LfsS ${ALPINE_GLIBC_REPO}/${GLIBC_VER}/glibc-${GLIBC_VER}.apk -o /tmp/glibc-${GLIBC_VER}.apk \
    && apk add --force-overwrite --no-cache /tmp/glibc-${GLIBC_VER}.apk \
    && apk del gcompat \
    && curl -LfsS ${ALPINE_GLIBC_REPO}/${GLIBC_VER}/glibc-bin-${GLIBC_VER}.apk -o /tmp/glibc-bin-${GLIBC_VER}.apk \
    && apk add --no-cache /tmp/glibc-bin-${GLIBC_VER}.apk \
    && curl -Ls ${ALPINE_GLIBC_REPO}/${GLIBC_VER}/glibc-i18n-${GLIBC_VER}.apk -o /tmp/glibc-i18n-${GLIBC_VER}.apk \
    && apk add --no-cache /tmp/glibc-i18n-${GLIBC_VER}.apk \
    && curl -sL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip \
    && unzip awscliv2.zip \
    && aws/install \
    && rm -rf \
        awscliv2.zip \
        aws \
        /usr/local/aws-cli/v2/*/dist/aws_completer \
        /usr/local/aws-cli/v2/*/dist/awscli/data/ac.index \
        /usr/local/aws-cli/v2/*/dist/awscli/examples \
    && apk --no-cache del \
        binutils \
    && rm -f \
        /tmp/glibc-${GLIBC_VER}.apk \
        /tmp/glibc-bin-${GLIBC_VER}.apk \
        /tmp/glibc-i18n-${GLIBC_VER}.apk \
    && rm -rf /var/cache/apk/*

COPY entrypoint.sh /bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
