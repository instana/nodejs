# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-rc.0](https://github.com/instana/nodejs/compare/v1.138.0...v2.0.0-rc.0) (2022-03-08)


### chore

* **lambda:** remove nodejs8.10 from compatible runtimes ([b7ebc61](https://github.com/instana/nodejs/commit/b7ebc61dc52de97400f58c6efd12805f08b9501f))
* dropped Node 6/8 ([5b902d1](https://github.com/instana/nodejs/commit/5b902d1a848a601f67e569a7adcb10794754eb69))


### Code Refactoring

* remove npm package instana-nodejs-sensor ([bebfc2d](https://github.com/instana/nodejs/commit/bebfc2da9989ade98034e5a1ae87e0a0bd43a5d8))


### Features

* self-disable if detected Node.js runtime version is too old ([d934d37](https://github.com/instana/nodejs/commit/d934d37e1f56ea5b877f39e699054c1e4b675dd1))


### BREAKING CHANGES

* **lambda:** The Instana Node.js Lambda layer is no longer compatible with
Node.js 8. For Lambda functions still running on Node.js 8, please use the
latest layer version that has been published for Node.js 8, see
https://www.ibm.com/docs/en/obi/current?topic=kinesis-aws-lambda-native-tracing-nodejs
* Starting with version 2.0.0, consumers of the package who
still use the deprecated package name instana-nodejs-sensor will need to follow
https://www.ibm.com/docs/en/obi/current?topic=nodejs-collector-installation#change-of-package-name
to receive updates in the future.

refs 80206
* v2 has dropped support for Node 6/8.





# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)


### Features

* **aws-lambda:** added support for SSM parameter store ([#464](https://github.com/instana/nodejs/issues/464)) ([bdb6e68](https://github.com/instana/nodejs/commit/bdb6e68b821e45445752d351e3575c6b0d7f1da7))





## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)

**Note:** Version bump only for package @instana/aws-lambda





## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)


### Bug Fixes

* **aws-lambda:** fixed lambda timeouts when using extension ([#455](https://github.com/instana/nodejs/issues/455)) ([6df5550](https://github.com/instana/nodejs/commit/6df5550e59ab667a1eda5a01d911554e3dc17aee))
* **aws-lambda:** reduced lambda timeout error count when using extension [#443](https://github.com/instana/nodejs/issues/443) ([0bbfeb8](https://github.com/instana/nodejs/commit/0bbfeb8af57a381c5186624cbf5a19ead11ffe61))





## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)

**Note:** Version bump only for package @instana/aws-lambda





## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)

**Note:** Version bump only for package @instana/aws-lambda





## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)

**Note:** Version bump only for package @instana/aws-lambda
