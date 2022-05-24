# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.3.0](https://github.com/instana/nodejs/compare/v2.2.0...v2.3.0) (2022-05-24)


### Bug Fixes

* **http:** only capture response status/headers when they have been sent ([850b8e4](https://github.com/instana/nodejs/commit/850b8e43f93749e422e9923c10cef9a8d1e2f3ea)), closes [#548](https://github.com/instana/nodejs/issues/548)
* **kafkajs:** use long trace IDs with new Kafka message headers ([5674b08](https://github.com/instana/nodejs/commit/5674b086b1481e0aaf7c352924fbd45634456461))
* **rdkafka:** use long trace IDs with new Kafka message headers ([9c47349](https://github.com/instana/nodejs/commit/9c47349b5de214828c075eded71242a32c1f26c8))


### Features

* **kafkajs:** remove Instana headers on arrival ([f65bc75](https://github.com/instana/nodejs/commit/f65bc753667c8aaf636b0c0c6100f772338e639c))





# [2.2.0](https://github.com/instana/nodejs/compare/v2.1.0...v2.2.0) (2022-05-18)


### Bug Fixes

* **agent:** reduce log level for sending data from debug to trace ([8b57a71](https://github.com/instana/nodejs/commit/8b57a71eb9818f83acbdc8f9bf63623a7e415d07))


### Features

* **tracing:** added instrumentation for ibm db2  ([#532](https://github.com/instana/nodejs/issues/532)) ([0d0b1e0](https://github.com/instana/nodejs/commit/0d0b1e0d4409795206613c4c2cdcf1e270772dd8))





# [2.1.0](https://github.com/instana/nodejs/compare/v2.0.0...v2.1.0) (2022-04-28)


### Bug Fixes

* **tracing:** cancel sqs entry span sync when no messages are available ([8a66277](https://github.com/instana/nodejs/commit/8a662773716832469aeb1b512b5225043c5f344f))
* fix duplicated logger names and prevent them ([9d576c5](https://github.com/instana/nodejs/commit/9d576c54b97e9999820e0c597ec3fd10d3c660e2))
* **tracing:** implement updateConfig for Kafka instrumentations ([c386ee6](https://github.com/instana/nodejs/commit/c386ee6c01e96a605c39c54c464f41e5c8ee65af))


### Features

* **sdk:** expose span.cancel method ([d60571f](https://github.com/instana/nodejs/commit/d60571f680c8d9c2b68ece84930a6aa91bd77b6a))
* **tracing:** use new common tracing config from from agent response ([7f8825f](https://github.com/instana/nodejs/commit/7f8825f4eddb585595457378cfb2fb36eb868a37))





# [2.0.0](https://github.com/instana/nodejs/compare/v1.140.1...v2.0.0) (2022-04-04)


### Bug Fixes

* remove npm package instana-nodejs-sensor ([5fb9f18](https://github.com/instana/nodejs/commit/5fb9f1807998fb3335652d135eb167dc13f9221d))
* removed disableAutomaticTracing legacy config ([#432](https://github.com/instana/nodejs/issues/432)) ([922d168](https://github.com/instana/nodejs/commit/922d168855000f108d23daeb4e267037098ccc1f))
* removed legacy support for config.timeBetweenHealthcheckCalls ([#476](https://github.com/instana/nodejs/issues/476)) ([66eff69](https://github.com/instana/nodejs/commit/66eff6905f0fa4e55987c931345df88eb9fcf114))
* self-disable if detected Node.js runtime version is too old ([cfe4248](https://github.com/instana/nodejs/commit/cfe4248a9a107165f8e96dbcb1948b399527d244))


### BREAKING CHANGES

* Removed support for legacy config `instana({ timeBetweenHealthcheckCalls: ... })`.
                 Use `instana({ metrics: { timeBetweenHealthcheckCalls: ...}})`.
* Starting with version 2.0.0, consumers of the package who
still use the deprecated package name instana-nodejs-sensor will need to follow
https://www.ibm.com/docs/en/obi/current?topic=nodejs-collector-installation#change-of-package-name
to receive updates in the future.
* Removed "disableAutomaticTracing" config option.
                 Use `instana({ automaticTracingEnabled: Boolean })`.





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
