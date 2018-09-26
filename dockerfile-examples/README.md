Examples Dockerfile
===================

Dockerizing your Node.js application is a thing. Since the Instana Node.js sensor uses some native addons (see [readme](https://github.com/instana/nodejs-sensor/#cpu-profiling-garbage-collection-and-event-loop-information)), it might be required to add additional operating system packages to your Docker image. This directory contains a few example Dockerfiles to test Docker builds with various base images and configurations.

This is probably relevant for you
- dockerize your Node.js application
- and are using a minimal Docker image (such as the popular Alpine variants of the popular official [Node.js Docker images](https://hub.docker.com/_/node/),
- or another base image that does not have all required packages installed,
- see `node-gyp` errors during your Docker build (in particular the `npm install`/`yarn install` step).

Note that all native dependencies are optional, so your Docker build will never fail due to missing operating system packages. The Node.js sensor will also do its work just fine, but certain features might not be available:
- CPU profiling
- garbage collection information
- event loop information
- reporting uncaught exceptions
