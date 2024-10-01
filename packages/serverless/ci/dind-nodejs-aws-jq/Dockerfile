# ----------------------------------------------------------------------------
# Loosely based on
#
# https://github.com/karlkfi/concourse-dcind/blob/477674e4a27d79fa62099a86aa032017d4292d12/Dockerfile
#
# Modifications:
# - Use a Node.js base image instead of raw alpine,
# - add glibc because the AWS cli requires that (does not work with muslc)
# - DOCKER_VERSION=20.10.11 instead of 19.03.2
# - removed docker-compose and some related package (py-pip, python3-dev)
# - removed docker squash support,
# - added jq, and
# - added/removed a bunch apk packages.
#
# Note: Needs to be run with --privileged.
# ----------------------------------------------------------------------------

FROM node:22.9-alpine3.20

ENV DOCKER_CHANNEL=stable \
    DOCKER_VERSION=20.10.11 \
    GLIBC_VER=2.34-r0

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
RUN apk --no-cache add \
        binutils \
    && curl -sL https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub -o /etc/apk/keys/sgerrand.rsa.pub \
    && curl -sLO https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VER}/glibc-${GLIBC_VER}.apk \
    && curl -sLO https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VER}/glibc-bin-${GLIBC_VER}.apk \
    && apk add --no-cache \
        glibc-${GLIBC_VER}.apk \
        glibc-bin-${GLIBC_VER}.apk \
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
    && rm glibc-${GLIBC_VER}.apk \
    && rm glibc-bin-${GLIBC_VER}.apk \
    && rm -rf /var/cache/apk/*

COPY entrypoint.sh /bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
