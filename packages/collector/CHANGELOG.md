# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-rc.0](https://github.com/instana/nodejs/compare/v1.138.0...v2.0.0-rc.0) (2022-03-08)


### chore

* dropped Node 6/8 ([5b902d1](https://github.com/instana/nodejs/commit/5b902d1a848a601f67e569a7adcb10794754eb69))
* removed disableAutomaticTracing legacy config ([#432](https://github.com/instana/nodejs/issues/432)) ([c8f6cef](https://github.com/instana/nodejs/commit/c8f6cef241c8b9f1b06ff6fe6de70386d6086e6f))
* removed legacy support for config.timeBetweenHealthcheckCalls ([#476](https://github.com/instana/nodejs/issues/476)) ([4c4f894](https://github.com/instana/nodejs/commit/4c4f894f9308da8fe3503585a7feac8a108a75af))
* removed support for passing parent logger during initialisation ([40d38f9](https://github.com/instana/nodejs/commit/40d38f9117be63b5ff1cc70a62e3f2b6b8e2f2e3))
* removed uncaught exception config ([9e25e14](https://github.com/instana/nodejs/commit/9e25e14f489339af66e10c8c023d866d588fc7b7))


### Code Refactoring

* remove npm package instana-nodejs-sensor ([bebfc2d](https://github.com/instana/nodejs/commit/bebfc2da9989ade98034e5a1ae87e0a0bd43a5d8))


### Features

* added asynclocalstorage implementation ([#430](https://github.com/instana/nodejs/issues/430)) ([fe86e3a](https://github.com/instana/nodejs/commit/fe86e3a32592a98de9cb869916435e45db07a1ea))
* self-disable if detected Node.js runtime version is too old ([d934d37](https://github.com/instana/nodejs/commit/d934d37e1f56ea5b877f39e699054c1e4b675dd1))


### BREAKING CHANGES

* Removed support for legacy config `instana({ timeBetweenHealthcheckCalls: ... })`.
                 Use `instana({ metrics: { timeBetweenHealthcheckCalls: ...}})`.

Co-authored-by: kirrg001 <katharina.irrgang@gmail.com>
* Starting with version 2.0.0, consumers of the package who
still use the deprecated package name instana-nodejs-sensor will need to follow
https://www.ibm.com/docs/en/obi/current?topic=nodejs-collector-installation#change-of-package-name
to receive updates in the future.

refs 80206
* Removed "disableAutomaticTracing" config option.
                 Use `instana({ automaticTracingEnabled: Boolean })`.

Co-authored-by: kirrg001 <katharina.irrgang@gmail.com>
* Removed "reportUncaughtException" config option.
	 	 The feature was completely removed.
* Removed support for passing logger to instana initialisation.
	 	 Use `instana.setLogger(logger)`".
* v2 has dropped support for Node 6/8.


# [1.139.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.139.0) (2022-03-09)


### Bug Fixes

* **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))


### Features

* **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))


# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)


### Bug Fixes

* **tracing:** fix version constraint for http2 instrumentation ([50f380f](https://github.com/instana/nodejs/commit/50f380f82bb877529daec51fbb16226a8b434751)), closes [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8) [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8)





## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)

**Note:** Version bump only for package @instana/collector





## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)

**Note:** Version bump only for package @instana/collector





## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)


### Bug Fixes

* **tracing:** fix context loss when cls-hooked#bindEmitter is used ([2743047](https://github.com/instana/nodejs/commit/2743047b79533f5d54233e23ecfce40635bc9981)), closes [#438](https://github.com/instana/nodejs/issues/438)





## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)


### Bug Fixes

* **collector:** prevent initializing @instana/collector multiple times ([b3261b7](https://github.com/instana/nodejs/commit/b3261b7a653b406cbe2eeaaf9050134bbeedfac9))





## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)


### Bug Fixes

* **dependency:** pinned semver to 7.3.3 ([d32f23e](https://github.com/instana/nodejs/commit/d32f23ea6807989d57ec6165c407b64e04d8d7c1))
* **dependency:** updated tar to 6.x in shared-metrics ([#415](https://github.com/instana/nodejs/issues/415)) ([5288ba5](https://github.com/instana/nodejs/commit/5288ba5241acd23d54f11c76edb3cffc0ffe6a66))
