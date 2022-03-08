# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-rc.0](https://github.com/instana/nodejs/compare/v1.138.0...v2.0.0-rc.0) (2022-03-08)


### chore

* dropped Node 6/8 ([5b902d1](https://github.com/instana/nodejs/commit/5b902d1a848a601f67e569a7adcb10794754eb69))


### Code Refactoring

* remove npm package instana-nodejs-sensor ([bebfc2d](https://github.com/instana/nodejs/commit/bebfc2da9989ade98034e5a1ae87e0a0bd43a5d8))


### Features

* **fargate:** detect Node.js version, use matching @instana/aws-fargate version ([3a57449](https://github.com/instana/nodejs/commit/3a57449d8994c2ad1f2a1764fbbfb00a88b7d52c))
* self-disable if detected Node.js runtime version is too old ([d934d37](https://github.com/instana/nodejs/commit/d934d37e1f56ea5b877f39e699054c1e4b675dd1))


### BREAKING CHANGES

* Starting with version 2.0.0, consumers of the package who
still use the deprecated package name instana-nodejs-sensor will need to follow
https://www.ibm.com/docs/en/obi/current?topic=nodejs-collector-installation#change-of-package-name
to receive updates in the future.

refs 80206
* v2 has dropped support for Node 6/8.





# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)

**Note:** Version bump only for package @instana/aws-fargate





## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)

**Note:** Version bump only for package @instana/aws-fargate





## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)

**Note:** Version bump only for package @instana/aws-fargate





## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)

**Note:** Version bump only for package @instana/aws-fargate





## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)


### Bug Fixes

* **tracing:** require @elastic/elasticsearch/api in a safe way ([8ba1bd1](https://github.com/instana/nodejs/commit/8ba1bd1d6fb082a9ec131ff15e8df17c7b18e116))





## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)

**Note:** Version bump only for package @instana/aws-fargate
