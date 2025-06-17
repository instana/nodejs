FROM dockcross/linux-s390x

# Create users: node and travis
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --shell /bin/bash --create-home node && \
  groupadd --gid 2000 travis && useradd --uid 2000 --gid travis --shell /bin/bash --create-home travis

# Install system dependencies
RUN apt-get -y update && \
  apt-get -y --no-install-recommends install \
  binutils-s390x-linux-gnu \
    git curl gnupg apt-transport-https build-essential python3 python3-pip && \
  rm -rf /var/lib/apt/lists/*

# Install Node.js LTS for s390x
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
  apt-get -y install nodejs && \
  npm -v && \
  rm -rf /var/lib/apt/lists/*

# We don't have dockcross variables, so emulate them here:
ENV PREBUILD_STRIP_BIN=/usr/bin/strip
ENV PREBUILD_ARCH=s390x
ENV PREBUILD_PLATFORM=linux

# Backward compatibility
ENV STRIP=${PREBUILD_STRIP_BIN}
ENV ARCH=${PREBUILD_ARCH}
ENV TARGET_PLATFORM=${PREBUILD_PLATFORM}

# Disable npm update check
ENV NO_UPDATE_NOTIFIER=true
ENV npm_config_update_notifier=false

# Clean dockcross labels
LABEL org.label-schema.build-date=
LABEL org.label-schema.name=
LABEL org.label-schema.schema-version=
LABEL org.label-schema.vcs-ref=
LABEL org.label-schema.vcs-url=
LABEL org.label-schema.version=

USER node
ENV HOME=/home/node
WORKDIR /app
