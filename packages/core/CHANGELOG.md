# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.140.1](https://github.com/instana/nodejs/compare/v1.140.0...v1.140.1) (2022-04-04)


### Bug Fixes

* **metrics:** do not report metrics from worker threads ([#517](https://github.com/instana/nodejs/issues/517)) ([bdf7869](https://github.com/instana/nodejs/commit/bdf7869e08d039e5769131d958e1037dc1748cd1)), closes [#500](https://github.com/instana/nodejs/issues/500)





# [1.140.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.140.0) (2022-03-24)


### Bug Fixes

* **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))


### Features

* **collector:** added instrumentation for @grpc/grpc-js ([d12e386](https://github.com/instana/nodejs/commit/d12e386e95ced2c68d2d549dff83ea3ecfe51735)), closes [#87653](https://github.com/instana/nodejs/issues/87653)
* **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))





# [1.139.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.139.0) (2022-03-09)


### Bug Fixes

* **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))


### Features

* **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))





# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)


### Bug Fixes

* **tracing:** fix version constraint for http2 instrumentation ([50f380f](https://github.com/instana/nodejs/commit/50f380f82bb877529daec51fbb16226a8b434751)), closes [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8) [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8)





## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)

**Note:** Version bump only for package @instana/core





## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)


### Bug Fixes

* **tracing:** fix vendoring of emitter-listener for legacy cls context ([440fd32](https://github.com/instana/nodejs/commit/440fd3218a37bc333da26c2365bfc1116a931b9b))





## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)


### Bug Fixes

* **aws-sdk/v3:** added support for @aws-sdk/* 3.4x ([61cc179](https://github.com/instana/nodejs/commit/61cc17945279f4f0996f87e2d955fc4daf519d24))
* **tracing:** fix context loss when cls-hooked#bindEmitter is used ([2743047](https://github.com/instana/nodejs/commit/2743047b79533f5d54233e23ecfce40635bc9981)), closes [#438](https://github.com/instana/nodejs/issues/438)





## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)


### Bug Fixes

* **tracing:** require @elastic/elasticsearch/api in a safe way ([8ba1bd1](https://github.com/instana/nodejs/commit/8ba1bd1d6fb082a9ec131ff15e8df17c7b18e116))





## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)


### Bug Fixes

* **dependency:** pinned lru-cache to 6.0.0 ([0ceb372](https://github.com/instana/nodejs/commit/0ceb372709bd53d0c6cab2060d8cdaf431133706))
* **dependency:** pinned semver to 7.3.3 ([d32f23e](https://github.com/instana/nodejs/commit/d32f23ea6807989d57ec6165c407b64e04d8d7c1))
