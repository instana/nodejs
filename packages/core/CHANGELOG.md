# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [5.0.2](https://github.com/instana/nodejs/compare/v5.0.1...v5.0.2) (2025-12-16)

**Note:** Version bump only for package @instana/core





## [5.0.1](https://github.com/instana/nodejs/compare/v5.0.0...v5.0.1) (2025-12-16)

**Note:** Version bump only for package @instana/core





# [5.0.0](https://github.com/instana/nodejs/compare/v4.31.0...v5.0.0) (2025-12-16)


### Bug Fixes

* bumped @opentelemetry/sdk-trace-base to v2 ([#2196](https://github.com/instana/nodejs/issues/2196)) ([31c4435](https://github.com/instana/nodejs/commit/31c44350483367ea633049f10ebd6e57cbd03fae))
* depreacted aws sdk v2 ([#2147](https://github.com/instana/nodejs/issues/2147)) ([45e9c9c](https://github.com/instana/nodejs/commit/45e9c9c38bb4e8bf3dd5c543cc5bd2d1b4ce2bcb))
* dropped support for kafka-avro ([#2141](https://github.com/instana/nodejs/issues/2141)) ([3e05a1e](https://github.com/instana/nodejs/commit/3e05a1e52936477eed91ea96357bd682a29ebeb4))
* enforced Node.js 18.19 as the minimum supported version ([#2151](https://github.com/instana/nodejs/issues/2151)) ([5d688e2](https://github.com/instana/nodejs/commit/5d688e22ff03a6e4721a0363011002801a1ee045))
* removed deprecated config options for disabling tracing ([#2145](https://github.com/instana/nodejs/issues/2145)) ([efe07ed](https://github.com/instana/nodejs/commit/efe07ed7c5b09fa66869f8305ce9a829638c1e0c))
* removed support for experimental loader flag ([#2153](https://github.com/instana/nodejs/issues/2153)) ([7e9a24a](https://github.com/instana/nodejs/commit/7e9a24a60b5afd0c73b3213df0f033d6554e388d))


### BREAKING CHANGES

* Dropped support for Node.js versions below 18.19
* - Removed support for --experimental-loader
- Removed support for esm-loader.mjs

Migration Recommendations: 

- Replace --experimental-loader with --import
- Use esm-register.mjs instead of esm-loader.mjs

e.g. --import /path/to/instana/node_modules/@instana/collector/esm-register.mjs
* The following environment variables and configuration options, previously used to disable tracing, have been removed:
- INSTANA_DISABLED_TRACERS
- INSTANA_DISABLE_TRACING
- tracing.disabledTracers

Migration Recommendations:
Replace INSTANA_DISABLED_TRACERS and INSTANA_DISABLE_TRACING with INSTANA_TRACING_DISABLE.
Replace tracing.disabledTracers with tracing.disable.





# [4.31.0](https://github.com/instana/nodejs/compare/v4.30.1...v4.31.0) (2025-12-08)


### Bug Fixes

* bumped @opentelemetry/instrumentation-oracledb from 0.33.0 to 0.34.0 ([#2155](https://github.com/instana/nodejs/issues/2155)) ([d572379](https://github.com/instana/nodejs/commit/d5723795a3a635b264c86d7400ceefea2dda9473))
* bumped @opentelemetry/instrumentation-tedious from 0.26.0 to 0.27.0 ([#2171](https://github.com/instana/nodejs/issues/2171)) ([fcbf7a0](https://github.com/instana/nodejs/commit/fcbf7a0c1b480aa90876bd429e228c747613a73e))
* excluded ng from tracing ([#2187](https://github.com/instana/nodejs/issues/2187)) ([1dd607d](https://github.com/instana/nodejs/commit/1dd607d7a6d472ebcd3bdc5630c496827dd12a32))
* resolved TypeError when Node.js entrypoint is unknown ([#2182](https://github.com/instana/nodejs/issues/2182)) ([19746e5](https://github.com/instana/nodejs/commit/19746e5713e94e8047b022f239e035779b4c8c2c))


### Features

* added support for Prisma V7 ([#2184](https://github.com/instana/nodejs/issues/2184)) ([5476da1](https://github.com/instana/nodejs/commit/5476da1aa6c9b68f2995819a922f3d60734279bc))





## [4.30.1](https://github.com/instana/nodejs/compare/v4.30.0...v4.30.1) (2025-11-18)


### Bug Fixes

* resolved infrastructure and endpoint correlation for otel spans ([#2159](https://github.com/instana/nodejs/issues/2159)) ([8c6b0d0](https://github.com/instana/nodejs/commit/8c6b0d0dfdc8ce1451938cf72928149c948c60e6))





# [4.30.0](https://github.com/instana/nodejs/compare/v4.29.0...v4.30.0) (2025-11-17)


### Bug Fixes

* bumped @opentelemetry/instrumentation-fs from 0.12.0 to 0.27.0 ([bbc727d](https://github.com/instana/nodejs/commit/bbc727d11fac7ac81b80b732b178446861cc8aad))
* bumped @opentelemetry/instrumentation-fs from 0.27.0 to 0.28.0 ([#2137](https://github.com/instana/nodejs/issues/2137)) ([06c34c8](https://github.com/instana/nodejs/commit/06c34c86a8d1f8afa68a615aaabf77d7e57725c3))
* bumped @opentelemetry/instrumentation-oracledb from 0.32.0 to 0.33.0 ([b268d81](https://github.com/instana/nodejs/commit/b268d8143d8c0f5e13485208bfec18a804f377b4))
* bumped @opentelemetry/instrumentation-restify from 0.38 to 0.53.0 ([c17d9b7](https://github.com/instana/nodejs/commit/c17d9b77adb5f3c6f52c1161d4edc8231ba17a32))
* bumped @opentelemetry/instrumentation-socket.io from 0.39.0 to 0.54.0 ([dc98e2e](https://github.com/instana/nodejs/commit/dc98e2eb7151023befeaa805dc1617c0afbcd74a))
* bumped @opentelemetry/instrumentation-tedious from 0.13.0 to 0.26.0 ([729640b](https://github.com/instana/nodejs/commit/729640b92c7594892930978771a8bb3cdc3d348a))
* bumped js-yaml from 4.1.0 to 4.1.1 ([#2157](https://github.com/instana/nodejs/issues/2157)) ([2c7962f](https://github.com/instana/nodejs/commit/2c7962ff92bde0754f61255a043c8106920cbd91))





# [4.29.0](https://github.com/instana/nodejs/compare/v4.28.0...v4.29.0) (2025-11-07)

**Note:** Version bump only for package @instana/core





# [4.28.0](https://github.com/instana/nodejs/compare/v4.27.1...v4.28.0) (2025-11-06)


### Features

* added support for parallel OpenTelemetry tracing ([#2118](https://github.com/instana/nodejs/issues/2118)) ([1aa0bd4](https://github.com/instana/nodejs/commit/1aa0bd446023a9165945320075b6c452aedfcff3)), closes [#2054](https://github.com/instana/nodejs/issues/2054)





## [4.27.1](https://github.com/instana/nodejs/compare/v4.27.0...v4.27.1) (2025-11-03)


### Bug Fixes

* bumped import-in-the-middle from 1.15.0 to 2.0.0 ([#2081](https://github.com/instana/nodejs/issues/2081)) ([3276651](https://github.com/instana/nodejs/commit/3276651a5d8c6873f5e361cd534777ec9625351c))
* **redis:** resolved pool instrumentation to use instance instead of prototype ([404111a](https://github.com/instana/nodejs/commit/404111a0adcb986a9988c1ffbab1c94288df7ced))





# [4.27.0](https://github.com/instana/nodejs/compare/v4.26.4...v4.27.0) (2025-10-23)

**Note:** Version bump only for package @instana/core





## [4.26.4](https://github.com/instana/nodejs/compare/v4.26.3...v4.26.4) (2025-10-21)

**Note:** Version bump only for package @instana/core





## [4.26.3](https://github.com/instana/nodejs/compare/v4.26.2...v4.26.3) (2025-10-21)

**Note:** Version bump only for package @instana/core





## [4.26.2](https://github.com/instana/nodejs/compare/v4.26.1...v4.26.2) (2025-10-15)

**Note:** Version bump only for package @instana/core





## [4.26.1](https://github.com/instana/nodejs/compare/v4.26.0...v4.26.1) (2025-10-13)


### Bug Fixes

* bumped @opentelemetry/instrumentation-oracledb from 0.29.0 to 0.32.0 ([#2055](https://github.com/instana/nodejs/issues/2055)) ([eddee3c](https://github.com/instana/nodejs/commit/eddee3c8af4fb0d8ebc6b1d7de88a32e7b97e31f))
* bumped import-in-the-middle from 1.14.2 to 1.14.4 ([#2056](https://github.com/instana/nodejs/issues/2056)) ([e6e3b4f](https://github.com/instana/nodejs/commit/e6e3b4f4f7cdcbed747b2055cf8a5024c898e62c))
* bumped import-in-the-middle from 1.14.4 to 1.15.0 ([#2064](https://github.com/instana/nodejs/issues/2064)) ([1022515](https://github.com/instana/nodejs/commit/102251575b87761e6721dd620ad2a3bb6f39b9b0))
* bumped semver from 7.7.2 to 7.7.3 ([#2053](https://github.com/instana/nodejs/issues/2053)) ([d5f0841](https://github.com/instana/nodejs/commit/d5f08418b6d145117f5888ea25d83994986dbeff))





# [4.26.0](https://github.com/instana/nodejs/compare/v4.25.0...v4.26.0) (2025-10-08)

**Note:** Version bump only for package @instana/core





# [4.25.0](https://github.com/instana/nodejs/compare/v4.24.1...v4.25.0) (2025-09-23)


### Bug Fixes

* **http:** correctly handled default ports for HTTP/HTTPS exit spans ([#2015](https://github.com/instana/nodejs/issues/2015)) ([19e17dc](https://github.com/instana/nodejs/commit/19e17dcf74ab631d06874acf1ab3439812fb7214))





## [4.24.1](https://github.com/instana/nodejs/compare/v4.24.0...v4.24.1) (2025-09-18)


### Bug Fixes

* bumped import-in-the-middle from 1.9.0 to 1.14.2 ([#1980](https://github.com/instana/nodejs/issues/1980)) ([cfd10ae](https://github.com/instana/nodejs/commit/cfd10aeb0f3468d9466c4bf0d813f7d073a685a6))
* forced debug dependency to ^4.4.3 ([#2007](https://github.com/instana/nodejs/issues/2007)) ([3d5caaa](https://github.com/instana/nodejs/commit/3d5caaa70a9b841945a4adfe5978db54734cf9fa))





# [4.24.0](https://github.com/instana/nodejs/compare/v4.23.1...v4.24.0) (2025-09-11)


### Features

* added support for oracledb ([#1828](https://github.com/instana/nodejs/issues/1828)) ([27e4dd3](https://github.com/instana/nodejs/commit/27e4dd35307afb20a80dabc4fd67cb8b9b32e6e0))





## [4.23.1](https://github.com/instana/nodejs/compare/v4.23.0...v4.23.1) (2025-09-01)


### Reverts

* Revert "fix: added detailed debug logs for span collection and transmission (…" ([9c3af67](https://github.com/instana/nodejs/commit/9c3af67baebe4aa826691a3ac7600f21f340f7f7))





# [4.23.0](https://github.com/instana/nodejs/compare/v4.22.0...v4.23.0) (2025-08-25)


### Bug Fixes

* added detailed debug logs for span collection and transmission ([#1960](https://github.com/instana/nodejs/issues/1960)) ([7d5d35b](https://github.com/instana/nodejs/commit/7d5d35bdab95580b3b63b4a89d867fb465730fc8))


### Features

* added support for @koa/router ([#1954](https://github.com/instana/nodejs/issues/1954)) ([3b982ba](https://github.com/instana/nodejs/commit/3b982ba3547112f5849229fb2d2f404644746332))





# [4.22.0](https://github.com/instana/nodejs/compare/v4.21.3...v4.22.0) (2025-08-13)


### Bug Fixes

* bumped semver from 7.5.4 to 7.7.2 ([#1935](https://github.com/instana/nodejs/issues/1935)) ([b9c64cb](https://github.com/instana/nodejs/commit/b9c64cb5e2fd899420a528c51403713bd78819ce))
* handled ignoring endpoint configs with connections only ([#1941](https://github.com/instana/nodejs/issues/1941)) ([a613db5](https://github.com/instana/nodejs/commit/a613db5e42f156226dc9db6bfce201a44d483873))


### Features

* added support for ignoring http entry calls ([#1875](https://github.com/instana/nodejs/issues/1875)) ([42faf03](https://github.com/instana/nodejs/commit/42faf030459d5218165a377855dc6c43ea450d19))





## [4.21.3](https://github.com/instana/nodejs/compare/v4.21.2...v4.21.3) (2025-08-07)


### Reverts

* Revert "fix: reduced memory when otel integration is turned off (#1905)" ([9bb6f96](https://github.com/instana/nodejs/commit/9bb6f961e031e5d587c6adadc6c3d866af337c80)), closes [#1905](https://github.com/instana/nodejs/issues/1905)





## [4.21.2](https://github.com/instana/nodejs/compare/v4.21.1...v4.21.2) (2025-08-05)

**Note:** Version bump only for package @instana/core





## [4.21.1](https://github.com/instana/nodejs/compare/v4.21.0...v4.21.1) (2025-08-05)


### Bug Fixes

* reduced memory when otel integration is turned off ([#1905](https://github.com/instana/nodejs/issues/1905)) ([9724825](https://github.com/instana/nodejs/commit/972482505d055d84c823e419c8c341dd9a084e09))





# [4.21.0](https://github.com/instana/nodejs/compare/v4.20.0...v4.21.0) (2025-07-31)


### Bug Fixes

* **collector:** reduced memory consumption in yaml reader component ([#1885](https://github.com/instana/nodejs/issues/1885)) ([2da490c](https://github.com/instana/nodejs/commit/2da490c06da7c914fdd1faa06ca24336781e501d))


### Features

* **aws-lambda:** improved overhaul performance ([#1315](https://github.com/instana/nodejs/issues/1315)) ([4620113](https://github.com/instana/nodejs/commit/46201132dac6a73e7719d085c4edaa5c5a5ae526))





# [4.20.0](https://github.com/instana/nodejs/compare/v4.19.1...v4.20.0) (2025-07-30)


### Features

* added support for @azure/storage-blob v12.28.0 ([#1884](https://github.com/instana/nodejs/issues/1884)) ([0e96cce](https://github.com/instana/nodejs/commit/0e96cce11a8af39cea87e5f65ec00dbd59b19201))





## [4.19.1](https://github.com/instana/nodejs/compare/v4.19.0...v4.19.1) (2025-07-25)

**Note:** Version bump only for package @instana/core





# [4.19.0](https://github.com/instana/nodejs/compare/v4.18.1...v4.19.0) (2025-07-24)

**Note:** Version bump only for package @instana/core





## [4.18.1](https://github.com/instana/nodejs/compare/v4.18.0...v4.18.1) (2025-07-14)

**Note:** Version bump only for package @instana/core





# [4.18.0](https://github.com/instana/nodejs/compare/v4.17.0...v4.18.0) (2025-07-10)


### Features

* added environment variable to disable EOL events ([#1829](https://github.com/instana/nodejs/issues/1829)) ([ff7e138](https://github.com/instana/nodejs/commit/ff7e1389fc9cc55359e4460ed6f15c72af6a0c7c))





# [4.17.0](https://github.com/instana/nodejs/compare/v4.16.0...v4.17.0) (2025-06-30)


### Bug Fixes

* depreacted INSTANA_DISABLE_TRACING env variable ([#1796](https://github.com/instana/nodejs/issues/1796)) ([4559cb8](https://github.com/instana/nodejs/commit/4559cb82ae955d77d10e991f544bdf2c1d17fe62))
* deprecate disabled tracer config ([#1788](https://github.com/instana/nodejs/issues/1788)) ([d4dd286](https://github.com/instana/nodejs/commit/d4dd2862240b5f6ed750a43b39cde2876586b164))


### Features

*  added support for disabling instrumentations and groups via agent config ([#1795](https://github.com/instana/nodejs/issues/1795)) ([2ea28eb](https://github.com/instana/nodejs/commit/2ea28eb91560f570bef066bc6b7f5827e7f4a173))
* added support for disable tracing by groups ([#1755](https://github.com/instana/nodejs/issues/1755)) ([64b6e4a](https://github.com/instana/nodejs/commit/64b6e4ad93c7046a84bee26c87b9057bcfe3cf2a))





# [4.16.0](https://github.com/instana/nodejs/compare/v4.15.3...v4.16.0) (2025-06-24)


### Bug Fixes

* **collector:** optimized flushing spans before application dies ([#1765](https://github.com/instana/nodejs/issues/1765)) ([3507599](https://github.com/instana/nodejs/commit/35075996e879734a7bb9437c1ce375b9d979fe3a)), closes [#1315](https://github.com/instana/nodejs/issues/1315)


### Features

* added ability to filter spans by connection ([#1758](https://github.com/instana/nodejs/issues/1758)) ([3ff8d29](https://github.com/instana/nodejs/commit/3ff8d2965da1acdee21f6037d4911980d1eddf06))


### Reverts

* Revert "fix: renamed disabledTracers to disableTracers config (#1766)" ([52ce6d0](https://github.com/instana/nodejs/commit/52ce6d082c2f93f0fb9373982f60e577b5db7ac9)), closes [#1766](https://github.com/instana/nodejs/issues/1766)





## [4.15.3](https://github.com/instana/nodejs/compare/v4.15.2...v4.15.3) (2025-06-11)

**Note:** Version bump only for package @instana/core

## [4.15.2](https://github.com/instana/nodejs/compare/v4.15.1...v4.15.2) (2025-06-11)

**Note:** Version bump only for package @instana/core

## [4.15.1](https://github.com/instana/nodejs/compare/v4.15.0...v4.15.1) (2025-06-09)

**Note:** Version bump only for package @instana/core

# [4.15.0](https://github.com/instana/nodejs/compare/v4.14.0...v4.15.0) (2025-05-27)

### Features

- added support for redis sentinel ([#1737](https://github.com/instana/nodejs/issues/1737)) ([2f791c1](https://github.com/instana/nodejs/commit/2f791c103881eb80ae37bb5984710d00c6f6ca5a))
- added support for redis v5 ([#1710](https://github.com/instana/nodejs/issues/1710)) ([1bd7a14](https://github.com/instana/nodejs/commit/1bd7a149d6f7324bbcb8bf2a5f16ef4c46016f9a))

# [4.14.0](https://github.com/instana/nodejs/compare/v4.13.0...v4.14.0) (2025-05-13)

**Note:** Version bump only for package @instana/core

# [4.13.0](https://github.com/instana/nodejs/compare/v4.12.0...v4.13.0) (2025-05-08)

### Features

- added support for node v24 ([#1694](https://github.com/instana/nodejs/issues/1694)) ([5071bac](https://github.com/instana/nodejs/commit/5071bac52152eed0e786cc6bfbd812627032bcb2))

# [4.12.0](https://github.com/instana/nodejs/compare/v4.11.1...v4.12.0) (2025-05-06)

**Note:** Version bump only for package @instana/core

## [4.11.1](https://github.com/instana/nodejs/compare/v4.11.0...v4.11.1) (2025-04-24)

### Bug Fixes

- resolved "Cannot read properties of undefined (reading 'debug')" ([#1702](https://github.com/instana/nodejs/issues/1702)) ([8c166b0](https://github.com/instana/nodejs/commit/8c166b05350c3d5df6d1e2f1503db0910a9902a4)), closes [#1701](https://github.com/instana/nodejs/issues/1701)

# [4.11.0](https://github.com/instana/nodejs/compare/v4.10.0...v4.11.0) (2025-04-22)

### Features

- **kafka:** added option to disable downstream suppression for ignored endpoints ([#1652](https://github.com/instana/nodejs/issues/1652)) ([2aa720d](https://github.com/instana/nodejs/commit/2aa720defbbb3c2c31754a85ecf3f899061f1597))

# [4.10.0](https://github.com/instana/nodejs/compare/v4.9.0...v4.10.0) (2025-04-01)

### Features

- added support for express v5 ([#1654](https://github.com/instana/nodejs/issues/1654)) ([8576291](https://github.com/instana/nodejs/commit/85762916de721833f6722fbb75f978aceafd83a8))

# [4.9.0](https://github.com/instana/nodejs/compare/v4.8.0...v4.9.0) (2025-03-20)

### Features

- **kafka:** added support for ignore endpoints ([#1616](https://github.com/instana/nodejs/issues/1616)) ([c8d8e47](https://github.com/instana/nodejs/commit/c8d8e47e1454844a4ea081c49678c374036fab5b))

# [4.8.0](https://github.com/instana/nodejs/compare/v4.7.0...v4.8.0) (2025-03-19)

**Note:** Version bump only for package @instana/core

# [4.7.0](https://github.com/instana/nodejs/compare/v4.6.3...v4.7.0) (2025-03-11)

### Features

- added INSTANA_IGNORE_ENDPOINTS_PATH for external YAML config ([#1605](https://github.com/instana/nodejs/issues/1605)) ([58312fa](https://github.com/instana/nodejs/commit/58312fa3b699b09033c79770f71f47f30a948243))

## [4.6.3](https://github.com/instana/nodejs/compare/v4.6.2...v4.6.3) (2025-03-05)

### Bug Fixes

- reduced noise for dependency calculation debug logs ([#1589](https://github.com/instana/nodejs/issues/1589)) ([1aeaa94](https://github.com/instana/nodejs/commit/1aeaa94ad1431b5f7807d0e3d93384b585c97d5d))
- resolved calling callback twice in agent connection ([#1600](https://github.com/instana/nodejs/issues/1600)) ([dfeab1c](https://github.com/instana/nodejs/commit/dfeab1c82c580812c3f06c6eff085ef73b69ef6a))
- resolved Instana log calls being traced with custom logger setup ([#1562](https://github.com/instana/nodejs/issues/1562)) ([63aa2a7](https://github.com/instana/nodejs/commit/63aa2a737f461fa027b51bc6d4e7b510dd923e63))

## [4.6.2](https://github.com/instana/nodejs/compare/v4.6.1...v4.6.2) (2025-02-24)

**Note:** Version bump only for package @instana/core

## [4.6.1](https://github.com/instana/nodejs/compare/v4.6.0...v4.6.1) (2025-01-29)

### Bug Fixes

- deprecated nats-streaming ([#1533](https://github.com/instana/nodejs/issues/1533)) ([7963ecd](https://github.com/instana/nodejs/commit/7963ecdab4c9c04ec2bc9baf8e82d791edf25b76))
- resolved tracing for deferred exit spans in http2 ([#1531](https://github.com/instana/nodejs/issues/1531)) ([2e5c912](https://github.com/instana/nodejs/commit/2e5c912a1bf16414680902b4707257f9fadec99f))

# [4.6.0](https://github.com/instana/nodejs/compare/v4.5.3...v4.6.0) (2025-01-18)

**Note:** Version bump only for package @instana/core

## [4.5.3](https://github.com/instana/nodejs/compare/v4.5.2...v4.5.3) (2025-01-14)

### Bug Fixes

- resolved more logging objects structure ([#1510](https://github.com/instana/nodejs/issues/1510)) ([bd4c9bb](https://github.com/instana/nodejs/commit/bd4c9bbda2c82aee7f6c59fcca03ac5588566839))

## [4.5.2](https://github.com/instana/nodejs/compare/v4.5.1...v4.5.2) (2025-01-13)

### Bug Fixes

- resolved logging objects being undefined or missing ([#1509](https://github.com/instana/nodejs/issues/1509)) ([7715fed](https://github.com/instana/nodejs/commit/7715fed5843716a6e49d79f221efcec33a9a1c9d))

## [4.5.1](https://github.com/instana/nodejs/compare/v4.5.0...v4.5.1) (2025-01-13)

### Bug Fixes

- resolved bunyan npm installation warning ([#1447](https://github.com/instana/nodejs/issues/1447)) ([c4abc75](https://github.com/instana/nodejs/commit/c4abc75e8f0fb347310ce2bc6a0c24f8c3343b15))

# [4.5.0](https://github.com/instana/nodejs/compare/v4.4.0...v4.5.0) (2024-12-16)

### Features

- **dynamodb:** added endpoint filtering ([#1484](https://github.com/instana/nodejs/issues/1484)) ([93e4023](https://github.com/instana/nodejs/commit/93e4023058bf4324ad6f287be92960786cc319ad))

# [4.4.0](https://github.com/instana/nodejs/compare/v4.3.0...v4.4.0) (2024-12-12)

### Features

- added support for couchbase v4.4.4 ([#1466](https://github.com/instana/nodejs/issues/1466)) ([fb06bdc](https://github.com/instana/nodejs/commit/fb06bdc1f4f15f0501ae957a8b36f5f095f363cf))

# [4.3.0](https://github.com/instana/nodejs/compare/v4.2.0...v4.3.0) (2024-12-10)

### Features

- added support for mysql2 v3.11.5 ([#1467](https://github.com/instana/nodejs/issues/1467)) ([45414f5](https://github.com/instana/nodejs/commit/45414f502a7be304ce475ad1a0a46e2d2bb2652f))
- **redis:** added endpoint filtering ([#1448](https://github.com/instana/nodejs/issues/1448)) ([2f45ff7](https://github.com/instana/nodejs/commit/2f45ff75d68fd782ac511448bad6fc5e484cecb8))

# [4.2.0](https://github.com/instana/nodejs/compare/v4.1.0...v4.2.0) (2024-11-22)

**Note:** Version bump only for package @instana/core

# [4.1.0](https://github.com/instana/nodejs/compare/v4.0.1...v4.1.0) (2024-11-19)

### Features

- added support for graphql-subscriptions v3 ([#1446](https://github.com/instana/nodejs/issues/1446)) ([e4a978c](https://github.com/instana/nodejs/commit/e4a978cf517de3c3fb1dd8bf27f1ba7c5632017a))

## [4.0.1](https://github.com/instana/nodejs/compare/v4.0.0...v4.0.1) (2024-10-28)

**Note:** Version bump only for package @instana/core

# [4.0.0](https://github.com/instana/nodejs/compare/v3.21.0...v4.0.0) (2024-10-23)

### Bug Fixes

- deprecated kafka-avro ([#1337](https://github.com/instana/nodejs/issues/1337)) ([5647c3f](https://github.com/instana/nodejs/commit/5647c3fc8383329b187b6edd54dcbbfd5a90f021))
- dropped support for disabling AWS SDK instrumentation in old syntax ([#1383](https://github.com/instana/nodejs/issues/1383)) ([48bebf3](https://github.com/instana/nodejs/commit/48bebf3d2342a2dbe1f9c06ab0a5a3ad10a26c29))
- dropped support for node v14 and v16 ([#1348](https://github.com/instana/nodejs/issues/1348)) ([aaa9ad4](https://github.com/instana/nodejs/commit/aaa9ad41ebf82b11eedcf913afc31d3addd53868))
- dropped support for q library ([#1377](https://github.com/instana/nodejs/issues/1377)) ([c7f1fa5](https://github.com/instana/nodejs/commit/c7f1fa57f76a0cb8faefafaa0a30eb45a898b53a))
- dropped support for x-instana-service header ([#1355](https://github.com/instana/nodejs/issues/1355)) ([7aa5f4b](https://github.com/instana/nodejs/commit/7aa5f4b87e07fc5d1d804aeae1eaea173fdb33c6))
- **kafka:** enforced string format for Kafka trace headers and dropped binary support ([#1296](https://github.com/instana/nodejs/issues/1296)) ([2c822d3](https://github.com/instana/nodejs/commit/2c822d3c68966737a1e83d4141bd5a5ac3958cc8))

### Features

- added support for root exit spans ([#1297](https://github.com/instana/nodejs/issues/1297)) ([f1e1f30](https://github.com/instana/nodejs/commit/f1e1f30b87983bf9109a0ac097ec10458edd3643))

### BREAKING CHANGES

- - Removed the ability to disable AWS SDK instrumentation using the old syntax disabledTracers: ['aws-sdk/v2/index'].

* Migrate to the new syntax for disabling instrumentation: disabledTracers: ['aws-sdk/v2'].

- - Migration: Please configure the Instana agent to capture the X-Instana-Service header in the agent's configuration file.

* For details, see: https://www.ibm.com/docs/en/instana-observability/current?topic=applications-services#specify-the-x-instana-service-http-header.

- - Dropped support for Node.js versions 14 and 16.

* Reason: These versions have reached their end of life.
* More info: https://github.com/nodejs/Release?tab=readme-ov-file#end-of-life-releases

- **kafka:** - Removed the ability to configure the header format; headers will always be sent in 'string' format.

* Removed support for 'binary' format and code related to sending headers in 'binary' or 'both' formats.
  refs INSTA-809

# [3.21.0](https://github.com/instana/nodejs/compare/v3.20.2...v3.21.0) (2024-10-17)

### Features

- added v23 support ([#1385](https://github.com/instana/nodejs/issues/1385)) ([34b990f](https://github.com/instana/nodejs/commit/34b990f2ab2a88aa6f2b0730296b7ae75e613ab0))
- **sdk:** added SpanHandle & NoopSpanHandle types ([#1374](https://github.com/instana/nodejs/issues/1374)) ([5e762a3](https://github.com/instana/nodejs/commit/5e762a3c77f0e7e7aa577742abd7572188e4eda6))

## [3.20.2](https://github.com/instana/nodejs/compare/v3.20.1...v3.20.2) (2024-10-09)

**Note:** Version bump only for package @instana/core

## [3.20.1](https://github.com/instana/nodejs/compare/v3.20.0...v3.20.1) (2024-10-04)

### Bug Fixes

- added log to capture instana headers from incoming request ([89c3051](https://github.com/instana/nodejs/commit/89c30514385b90f78cdf3ca8f51e95c8db77f533))

# [3.20.0](https://github.com/instana/nodejs/compare/v3.19.0...v3.20.0) (2024-10-01)

### Bug Fixes

- connected deferred exit span with original entry span ([#1346](https://github.com/instana/nodejs/issues/1346)) ([98f99e1](https://github.com/instana/nodejs/commit/98f99e18ee8323d70f07b045ff740f4d12486c30)), closes [#1297](https://github.com/instana/nodejs/issues/1297)

### Features

- extended typescript support ([#1349](https://github.com/instana/nodejs/issues/1349)) ([3b8abea](https://github.com/instana/nodejs/commit/3b8abeada99cc5952dd8362db54adc66cd8be7da))

# [3.19.0](https://github.com/instana/nodejs/compare/v3.18.2...v3.19.0) (2024-09-25)

### Features

- added support for fastify v5 ([#1336](https://github.com/instana/nodejs/issues/1336)) ([a646a14](https://github.com/instana/nodejs/commit/a646a145de933be8ecdec7c37f38f3821db2ef4f))

## [3.18.2](https://github.com/instana/nodejs/compare/v3.18.1...v3.18.2) (2024-09-17)

### Bug Fixes

- **ioredis:** repaired cluster functionality ([#1334](https://github.com/instana/nodejs/issues/1334)) ([ca5bd24](https://github.com/instana/nodejs/commit/ca5bd242ee3aeed177643e0d36a1b69c5a976e46)), closes [#1327](https://github.com/instana/nodejs/issues/1327)

## [3.18.1](https://github.com/instana/nodejs/compare/v3.18.0...v3.18.1) (2024-09-12)

### Bug Fixes

- added deprecation warning for Kafka header migration ([#1311](https://github.com/instana/nodejs/issues/1311)) ([fa1e4bd](https://github.com/instana/nodejs/commit/fa1e4bd74df6937cb9e5091717b98bc2ff619736))
- **ioredis:** reverted multi/pipeline handling from [#1292](https://github.com/instana/nodejs/issues/1292) ([#1328](https://github.com/instana/nodejs/issues/1328)) ([09fc2f7](https://github.com/instana/nodejs/commit/09fc2f7112fecf709ccae9eb029da6ac89ee920d))

# [3.18.0](https://github.com/instana/nodejs/compare/v3.17.1...v3.18.0) (2024-09-06)

### Features

- added support for ioredis cluster ([#1292](https://github.com/instana/nodejs/issues/1292)) ([0318eac](https://github.com/instana/nodejs/commit/0318eace6c8e682bf49a10f819d49cf03942a2f1))

## [3.17.1](https://github.com/instana/nodejs/compare/v3.17.0...v3.17.1) (2024-09-03)

### Bug Fixes

- resolved mongoose error ".make is not a function" ([#1304](https://github.com/instana/nodejs/issues/1304)) ([728f7a4](https://github.com/instana/nodejs/commit/728f7a446ec0207f8b79c8a6cfc28e85488f6c1d))

# [3.17.0](https://github.com/instana/nodejs/compare/v3.16.0...v3.17.0) (2024-09-02)

**Note:** Version bump only for package @instana/core

# [3.16.0](https://github.com/instana/nodejs/compare/v3.15.2...v3.16.0) (2024-08-28)

### Bug Fixes

- exposed preload flags in debug mode ([#1268](https://github.com/instana/nodejs/issues/1268)) ([775df15](https://github.com/instana/nodejs/commit/775df15105d1599819d9413b8a329deeaedea892))

### Features

- added support for redis cluster ([#1270](https://github.com/instana/nodejs/issues/1270)) ([4d1dc72](https://github.com/instana/nodejs/commit/4d1dc726451d28ccbe3b94f7f12b0b74ba7b5660))
- added support for tedious v18 ([#1289](https://github.com/instana/nodejs/issues/1289)) ([e2990c1](https://github.com/instana/nodejs/commit/e2990c1c47ae94696e25d01d07f0fa5fe7ba7354))

## [3.15.2](https://github.com/instana/nodejs/compare/v3.15.1...v3.15.2) (2024-08-27)

### Bug Fixes

- **aws-lambda:** improved debug logs for number of spans ([c7a3c34](https://github.com/instana/nodejs/commit/c7a3c3407ea83eeac2d54419163a0b2265a94bb6))
- deprecated q library ([#1282](https://github.com/instana/nodejs/issues/1282)) ([d86f939](https://github.com/instana/nodejs/commit/d86f939e9bc20c06dead85376eb90b42def5c9c4))

## [3.15.1](https://github.com/instana/nodejs/compare/v3.15.0...v3.15.1) (2024-08-19)

**Note:** Version bump only for package @instana/core

# [3.15.0](https://github.com/instana/nodejs/compare/v3.14.4...v3.15.0) (2024-08-13)

### Features

- added support for express v5 beta-3 ([#1261](https://github.com/instana/nodejs/issues/1261)) ([bf471ed](https://github.com/instana/nodejs/commit/bf471edd5dcd2d91bb30b88170cb94bc5b2ee8aa))

## [3.14.4](https://github.com/instana/nodejs/compare/v3.14.3...v3.14.4) (2024-07-22)

### Bug Fixes

- **core:** avoided creating standalone exit spans when using the sdk ([#1234](https://github.com/instana/nodejs/issues/1234)) ([9a0d8fc](https://github.com/instana/nodejs/commit/9a0d8fc0420e7462c3f17e247127b44a320eeace))

## [3.14.3](https://github.com/instana/nodejs/compare/v3.14.2...v3.14.3) (2024-07-11)

**Note:** Version bump only for package @instana/core

## [3.14.2](https://github.com/instana/nodejs/compare/v3.14.1...v3.14.2) (2024-07-09)

**Note:** Version bump only for package @instana/core

## [3.14.1](https://github.com/instana/nodejs/compare/v3.14.0...v3.14.1) (2024-06-26)

### Bug Fixes

- resolved module loading issue with the latest release ([#1201](https://github.com/instana/nodejs/issues/1201)) ([93f2a36](https://github.com/instana/nodejs/commit/93f2a3614ee47b71e2424d9d81570c681887f75e))

# [3.14.0](https://github.com/instana/nodejs/compare/v3.13.0...v3.14.0) (2024-06-26)

### Features

- added native esm support ([#1159](https://github.com/instana/nodejs/issues/1159)) ([8bfef61](https://github.com/instana/nodejs/commit/8bfef61a72f52423cb4aebb4023f61715a596ff1))

# [3.13.0](https://github.com/instana/nodejs/compare/v3.12.0...v3.13.0) (2024-06-24)

### Features

- **couchbase:** added support for raw sql queries ([#1187](https://github.com/instana/nodejs/issues/1187)) ([660795e](https://github.com/instana/nodejs/commit/660795e5d5fcf49656460031dc44507521512dfa))

# [3.12.0](https://github.com/instana/nodejs/compare/v3.11.0...v3.12.0) (2024-06-21)

### Features

- added support for tedious v16 and v17 ([#1184](https://github.com/instana/nodejs/issues/1184)) ([cd02b96](https://github.com/instana/nodejs/commit/cd02b96f0c1cd7abcf856f78bce1d736767dd62f))

# [3.11.0](https://github.com/instana/nodejs/compare/v3.10.0...v3.11.0) (2024-06-13)

**Note:** Version bump only for package @instana/core

# [3.10.0](https://github.com/instana/nodejs/compare/v3.9.0...v3.10.0) (2024-06-13)

**Note:** Version bump only for package @instana/core

# [3.9.0](https://github.com/instana/nodejs/compare/v3.8.1...v3.9.0) (2024-05-28)

### Features

- added support for got v12, v13, v14 ([#1157](https://github.com/instana/nodejs/issues/1157)) ([1333a3c](https://github.com/instana/nodejs/commit/1333a3c34ede5444608b6b76e810f474c5496249))
- added support for node-fetch v3 ([#1160](https://github.com/instana/nodejs/issues/1160)) ([b96f30c](https://github.com/instana/nodejs/commit/b96f30cfd80680917fc6993e2e47cd86102fd1be))

## [3.8.1](https://github.com/instana/nodejs/compare/v3.8.0...v3.8.1) (2024-05-17)

**Note:** Version bump only for package @instana/core

# [3.8.0](https://github.com/instana/nodejs/compare/v3.7.0...v3.8.0) (2024-05-06)

### Features

- added support for restify v9, v10, v11 ([#1140](https://github.com/instana/nodejs/issues/1140)) ([fb132d2](https://github.com/instana/nodejs/commit/fb132d2bf898cc943d9415e766a048cfd0846cb2))

# [3.7.0](https://github.com/instana/nodejs/compare/v3.6.0...v3.7.0) (2024-05-03)

### Features

- added support for Node v22 ([#1132](https://github.com/instana/nodejs/issues/1132)) ([6d08f43](https://github.com/instana/nodejs/commit/6d08f4359ecc6a936f68988609a311b2422b4f79))

# [3.6.0](https://github.com/instana/nodejs/compare/v3.5.0...v3.6.0) (2024-04-29)

**Note:** Version bump only for package @instana/core

# [3.5.0](https://github.com/instana/nodejs/compare/v3.4.0...v3.5.0) (2024-04-24)

### Features

- added support for prisma v5 ([#1114](https://github.com/instana/nodejs/issues/1114)) ([7cf8d90](https://github.com/instana/nodejs/commit/7cf8d90bd57b06110ea49e567be9f8a4d860b5a5))

# [3.4.0](https://github.com/instana/nodejs/compare/v3.3.1...v3.4.0) (2024-04-16)

### Features

- added azure blob instrumentation ([#967](https://github.com/instana/nodejs/issues/967)) ([8b3264a](https://github.com/instana/nodejs/commit/8b3264aa3afcadd87faeb048564ef3af7a8483d0))
- added support for mongoose >= 8.3.0 ([f60495a](https://github.com/instana/nodejs/commit/f60495aa39986cc060e269e5614e0134960c137d))

## [3.3.1](https://github.com/instana/nodejs/compare/v3.3.0...v3.3.1) (2024-04-11)

### Bug Fixes

- resolved esm loader issue for manual instrumentation node v18.19.0 and above ([#1063](https://github.com/instana/nodejs/issues/1063)) ([d69aff8](https://github.com/instana/nodejs/commit/d69aff86016a8b671a4ca97956d910b0ad51c99a))

# [3.3.0](https://github.com/instana/nodejs/compare/v3.2.1...v3.3.0) (2024-03-22)

### Bug Fixes

- resolved relative URL issue in sanitizeUrl method ([a2fac29](https://github.com/instana/nodejs/commit/a2fac29a619d83aa9cc8af69a717a4a8b603da2f))

## [3.2.1](https://github.com/instana/nodejs/compare/v3.2.0...v3.2.1) (2024-03-18)

### Bug Fixes

- **collector:** gracefully shutdown if core module process is not ava… ([#1070](https://github.com/instana/nodejs/issues/1070)) ([3d8196d](https://github.com/instana/nodejs/commit/3d8196d7253c8460e5f704470133f402fc558964))
- matrix parameters included in URLs ([#1069](https://github.com/instana/nodejs/issues/1069)) ([f1d2862](https://github.com/instana/nodejs/commit/f1d2862613bec31ee45bd7c0380dd2719d36f53f))
- **sqs:** spans not being captured caused by @aws-sdk/client-sqs@3.481.0 ([#1076](https://github.com/instana/nodejs/issues/1076)) ([aa71aa6](https://github.com/instana/nodejs/commit/aa71aa642b0914e760a7c93a8155f7f780feafaa))

# [3.2.0](https://github.com/instana/nodejs/compare/v3.1.3...v3.2.0) (2024-02-27)

### Bug Fixes

- depreacted request-promise module ([#1017](https://github.com/instana/nodejs/issues/1017)) ([6bb88dd](https://github.com/instana/nodejs/commit/6bb88dd4ca08d2482ff917fb3b9f884f4e4bdf8e))

### Features

- added otel instrumentation for tedious ([#1030](https://github.com/instana/nodejs/issues/1030)) ([87de73d](https://github.com/instana/nodejs/commit/87de73dd5b290a76663405822dc7845315e1d18d))

## [3.1.3](https://github.com/instana/nodejs/compare/v3.1.2...v3.1.3) (2024-01-31)

**Note:** Version bump only for package @instana/core

## [3.1.2](https://github.com/instana/nodejs/compare/v3.1.1...v3.1.2) (2024-01-29)

### Bug Fixes

- deprecated request module ([#1004](https://github.com/instana/nodejs/issues/1004)) ([8bd41a9](https://github.com/instana/nodejs/commit/8bd41a9fd9e7650b6076837b5c40eb73dbc293ba))

## [3.1.1](https://github.com/instana/nodejs/compare/v3.1.0...v3.1.1) (2024-01-10)

**Note:** Version bump only for package @instana/core

# [3.1.0](https://github.com/instana/nodejs/compare/v3.0.0...v3.1.0) (2024-01-04)

### Bug Fixes

- ignored opentelemetry spans which are not traces by us ([#974](https://github.com/instana/nodejs/issues/974)) ([62add1c](https://github.com/instana/nodejs/commit/62add1ce576d524986862e28b9547d02ebe602ad))

# [3.0.0](https://github.com/instana/nodejs/compare/v2.36.1...v3.0.0) (2023-12-12)

### Bug Fixes

- dropped node v10 and v12 ([#933](https://github.com/instana/nodejs/issues/933)) ([7e3ee32](https://github.com/instana/nodejs/commit/7e3ee32f7ef2ca60259eae40fd16ff24a6ec631b))

### Build System

- deprecated kafka-node ([1274419](https://github.com/instana/nodejs/commit/1274419e27366254836edd1398032d5f188b11ef))
- dropped elasticsearch library ([e1f480d](https://github.com/instana/nodejs/commit/e1f480d835ab94c3a45c849739e32a25d3106d16))
- dropped gRPC library ([acbfa27](https://github.com/instana/nodejs/commit/acbfa27ef1ab813b52bec8f458cb19257d89c147))
- dropped redis v0 ([e4db474](https://github.com/instana/nodejs/commit/e4db4744a15c5d8670799d52c6f183dc3e522fc4))

### Features

- **node-v21:** added support for node v21 ([#947](https://github.com/instana/nodejs/issues/947)) ([64cc797](https://github.com/instana/nodejs/commit/64cc797ee04056930d9740a7a92d5604abd461d1))

### BREAKING CHANGES

- Deprecated kafka-node library. Support will be removed in the next major release.
- Dropped support for node-redis v0 (https://github.com/redis/node-redis)
- Dropped elasticsearch lib support (https://www.npmjs.com/package/elasticsearch)
- Dropped support for gRPC lib (https://www.npmjs.com/package/grpc)
- Dropped Node v10 & v12 support.

## [2.36.1](https://github.com/instana/nodejs/compare/v2.36.0...v2.36.1) (2023-12-04)

### Bug Fixes

- **fetch:** fix header handling for Node.js >= 18.19.0 and >= 21.1.0 ([6420063](https://github.com/instana/nodejs/commit/6420063932c15b44a4aa436ec522dab4c03cca54))

# [2.36.0](https://github.com/instana/nodejs/compare/v2.35.0...v2.36.0) (2023-11-29)

### Bug Fixes

- **fetch:** fix header handling for native fetch for Node.js >= 20.10.0 ([ece1a9a](https://github.com/instana/nodejs/commit/ece1a9a0ba346cd12ad060b2f0827979f03dcb95))
- **fetch:** fix trace correlation for native fetch for Node.js >= 20.8.1 ([e834c30](https://github.com/instana/nodejs/commit/e834c30ca552580e7d35041bfd99407035c5eee1))

# [2.35.0](https://github.com/instana/nodejs/compare/v2.34.1...v2.35.0) (2023-11-14)

### Bug Fixes

- **couchbase:** added missing bucket type and name for bucket.query ([#922](https://github.com/instana/nodejs/issues/922)) ([fc2a9c0](https://github.com/instana/nodejs/commit/fc2a9c0e6b71e23a2106eb1de11d55a049a8ed9e))

### Features

- **google cloud storage:** added support for google cloud storage v7 ([#913](https://github.com/instana/nodejs/issues/913)) ([33be8da](https://github.com/instana/nodejs/commit/33be8da7f327bb15c96594b44e01b6b9ed0eefdc))

## [2.34.1](https://github.com/instana/nodejs/compare/v2.34.0...v2.34.1) (2023-10-23)

### Bug Fixes

- **rdkafka:** only log warning about header format once ([#897](https://github.com/instana/nodejs/issues/897)) ([d8bf0ce](https://github.com/instana/nodejs/commit/d8bf0ce377115eeaa6c186f6447072a06f45055a))
- reduced log warnings when there is no entry span ([#891](https://github.com/instana/nodejs/issues/891)) ([8543808](https://github.com/instana/nodejs/commit/854380826eb7f67f93009fed1ed79bccc7d69508)), closes [#885](https://github.com/instana/nodejs/issues/885)

# [2.34.0](https://github.com/instana/nodejs/compare/v2.33.1...v2.34.0) (2023-10-10)

### Features

- added support for aws sdk v3 lambda ([#871](https://github.com/instana/nodejs/issues/871)) ([eb85c91](https://github.com/instana/nodejs/commit/eb85c91228144084191d12589f3b1152f6e2529d))

### Reverts

- Revert "chore: migrated to npm workspaces and lerna v7 (#876)" ([763ac7e](https://github.com/instana/nodejs/commit/763ac7e69d56742009e18964d267313918813c80)), closes [#876](https://github.com/instana/nodejs/issues/876)

## [2.33.1](https://github.com/instana/nodejs/compare/v2.33.0...v2.33.1) (2023-09-26)

### Bug Fixes

- improved how to disable aws sdk instrumentation ([#866](https://github.com/instana/nodejs/issues/866)) ([d0483c2](https://github.com/instana/nodejs/commit/d0483c2f80a5639f56cb95ef98ac8f5085aea5fc))

# [2.33.0](https://github.com/instana/nodejs/compare/v2.32.0...v2.33.0) (2023-09-18)

### Features

- **aws:** added support for sns v3 ([#860](https://github.com/instana/nodejs/issues/860)) ([bd3e755](https://github.com/instana/nodejs/commit/bd3e7554fe21188c3ad10d442e4d72546d5c2267))

# [2.32.0](https://github.com/instana/nodejs/compare/v2.31.0...v2.32.0) (2023-09-11)

### Features

- added esm support for aws fargate ([#847](https://github.com/instana/nodejs/issues/847)) ([80472de](https://github.com/instana/nodejs/commit/80472dee48287a50d6af5bb9128fc113a3d40968))

# [2.31.0](https://github.com/instana/nodejs/compare/v2.30.2...v2.31.0) (2023-09-04)

### Features

- added support for batch write dynamodb ([#858](https://github.com/instana/nodejs/issues/858)) ([a276b84](https://github.com/instana/nodejs/commit/a276b843441eacd2b9451a21780375c44d24d613))

## [2.30.2](https://github.com/instana/nodejs/compare/v2.30.1...v2.30.2) (2023-08-28)

### Bug Fixes

- **dynamodb:** resolved all operation names ([#853](https://github.com/instana/nodejs/issues/853)) ([c7b17eb](https://github.com/instana/nodejs/commit/c7b17ebb1264add14c43e8585aea805912e3b351))

## [2.30.1](https://github.com/instana/nodejs/compare/v2.30.0...v2.30.1) (2023-08-25)

### Bug Fixes

- **core:** resolved flooding log file when agent connection is not established ([#850](https://github.com/instana/nodejs/issues/850)) ([c80eca6](https://github.com/instana/nodejs/commit/c80eca642f7b36a966da2d3cebf4271bcb08ac36)), closes [#849](https://github.com/instana/nodejs/issues/849)
- **core:** resolved missing dynamodb spans ([#851](https://github.com/instana/nodejs/issues/851)) ([7444a90](https://github.com/instana/nodejs/commit/7444a90c03e9a8582c7ed66b805f397ecab28955))

# [2.30.0](https://github.com/instana/nodejs/compare/v2.29.0...v2.30.0) (2023-08-16)

### Bug Fixes

- reduced noisy log warnings when active entry could not be found ([#840](https://github.com/instana/nodejs/issues/840)) ([9ba2697](https://github.com/instana/nodejs/commit/9ba2697b97643e9314456b1fef3e1b68e6acf446))

### Features

- added ability to provide a custom package json path ([#839](https://github.com/instana/nodejs/issues/839)) ([f37d898](https://github.com/instana/nodejs/commit/f37d898bcfc5d053b70251854b40b76e396a22b8))
- aws sdk v3 kinesis instrumentation ([#838](https://github.com/instana/nodejs/issues/838)) ([eae677c](https://github.com/instana/nodejs/commit/eae677cdba02c63cc310f3d4de6d5a4bdec1a298))

# [2.29.0](https://github.com/instana/nodejs/compare/v2.28.0...v2.29.0) (2023-07-31)

### Bug Fixes

- **tracing:** normalize incoming trace/span IDs from upstream tracers ([01e26d1](https://github.com/instana/nodejs/commit/01e26d110eb26b9143f33126f68e5594b00b32ea)), closes [#833](https://github.com/instana/nodejs/issues/833)

### Features

- added support for the latest aws sdk v3 changes ([#837](https://github.com/instana/nodejs/issues/837)) ([3936a9d](https://github.com/instana/nodejs/commit/3936a9da70752102e90cf3721e63bd83dce92151))

# [2.28.0](https://github.com/instana/nodejs/compare/v2.27.0...v2.28.0) (2023-07-27)

**Note:** Version bump only for package @instana/core

# [2.27.0](https://github.com/instana/nodejs/compare/v2.26.3...v2.27.0) (2023-07-24)

### Bug Fixes

- stack.slice not a function ([#828](https://github.com/instana/nodejs/issues/828)) ([827a722](https://github.com/instana/nodejs/commit/827a722939785ca70791e5c36de8a88a8c48423a))

## [2.26.3](https://github.com/instana/nodejs/compare/v2.26.2...v2.26.3) (2023-07-20)

### Bug Fixes

- **collector:** reduce warnings when exit span cannot be started ([#827](https://github.com/instana/nodejs/issues/827)) ([d0d82cf](https://github.com/instana/nodejs/commit/d0d82cfa4562129cf1de32afef853764e9f7d1a5))

## [2.26.2](https://github.com/instana/nodejs/compare/v2.26.1...v2.26.2) (2023-07-17)

### Bug Fixes

- skip init step when disabling individual instrumentations ([#824](https://github.com/instana/nodejs/issues/824)) ([8f8f661](https://github.com/instana/nodejs/commit/8f8f661c8dd416e94ce5e35f7b0eda81f0445c25))

## [2.26.1](https://github.com/instana/nodejs/compare/v2.26.0...v2.26.1) (2023-07-10)

### Bug Fixes

- **shared-metrics:** esm app package.json not being found when node_options is set ([#817](https://github.com/instana/nodejs/issues/817)) ([dc8f7af](https://github.com/instana/nodejs/commit/dc8f7af9b8f61bb97768eb18e36bff3fb80b6ccc))

# [2.26.0](https://github.com/instana/nodejs/compare/v2.25.3...v2.26.0) (2023-07-04)

**Note:** Version bump only for package @instana/core

## [2.25.3](https://github.com/instana/nodejs/compare/v2.25.2...v2.25.3) (2023-06-27)

**Note:** Version bump only for package @instana/core

## [2.25.2](https://github.com/instana/nodejs/compare/v2.25.1...v2.25.2) (2023-06-22)

### Bug Fixes

- **sdk:** do not overwrite span.ec after it has been set via the SDK ([4283cdf](https://github.com/instana/nodejs/commit/4283cdf962505d5471d3b849137f36a7134ae740))

## [2.25.1](https://github.com/instana/nodejs/compare/v2.25.0...v2.25.1) (2023-06-19)

**Note:** Version bump only for package @instana/core

# [2.25.0](https://github.com/instana/nodejs/compare/v2.24.0...v2.25.0) (2023-06-16)

### Features

- **sdk:** add method to mark the current span as erroneous ([2cfcc7b](https://github.com/instana/nodejs/commit/2cfcc7b921518b4dc174b8296cff0122f523d532))

# [2.24.0](https://github.com/instana/nodejs/compare/v2.23.0...v2.24.0) (2023-06-13)

### Features

- **collector:** added node:fs, restify and socket.io support (OpenTelemetry integration) ([#715](https://github.com/instana/nodejs/issues/715)) ([60f3bb9](https://github.com/instana/nodejs/commit/60f3bb960f909e0640b372de97c8f6d7c1654038)), closes [#109122](https://github.com/instana/nodejs/issues/109122)

# [2.23.0](https://github.com/instana/nodejs/compare/v2.22.1...v2.23.0) (2023-06-06)

**Note:** Version bump only for package @instana/core

## [2.22.1](https://github.com/instana/nodejs/compare/v2.22.0...v2.22.1) (2023-05-15)

### Bug Fixes

- **db2:** ensure span is correctly processed as an IBM DB2 span ([de3a8b4](https://github.com/instana/nodejs/commit/de3a8b4e2241fe089cb1938b6eb955057ec2b33e))
- **sqs:** fix missing async context in recent aws-sdk/client-sqs version ([6ae90e7](https://github.com/instana/nodejs/commit/6ae90e74fee5c47cc4ade67d21c4885d34c08847))

# [2.22.0](https://github.com/instana/nodejs/compare/v2.21.1...v2.22.0) (2023-05-09)

### Bug Fixes

- **collector:** keep EOL events open instead of recreating them ([6de9965](https://github.com/instana/nodejs/commit/6de9965c5fb667027a3b84fbd15aec3f591f32d5))

### Features

- **mongodb:** add support for mongodb v4, v5 & mongoose v6 & v7 ([4e80a26](https://github.com/instana/nodejs/commit/4e80a2680d3a438280aefa1ab8623e36ca17c290))
- **w3c:** support W3C trace context level 2 ([62e0f99](https://github.com/instana/nodejs/commit/62e0f99710fe3299f6c9825358221f5d065be50d))

## [2.21.1](https://github.com/instana/nodejs/compare/v2.21.0...v2.21.1) (2023-05-02)

### Bug Fixes

- **db2:** capture the correct destination dsn per client ([9529690](https://github.com/instana/nodejs/commit/9529690070871fddd2d31b0b646badc320dde56b))
- **elasticsearch:** capture the correct destination host per client ([cc23d05](https://github.com/instana/nodejs/commit/cc23d057a9d60a3a179e20451e0bc336e3c9a56d))
- **nats:** capture the correct destination nats address per client ([59e5ddf](https://github.com/instana/nodejs/commit/59e5ddfbbe85a724bfc040e140e63bf906706f2f))
- **nats-streaming:** capture correct destination address per client ([678d702](https://github.com/instana/nodejs/commit/678d70276dcb761eeb64dc3c848157267458192c))

# [2.21.0](https://github.com/instana/nodejs/compare/v2.20.2...v2.21.0) (2023-04-21)

### Features

- **collector:** added support for couchbase ([#737](https://github.com/instana/nodejs/issues/737)) ([3239b19](https://github.com/instana/nodejs/commit/3239b196eb54d7ea1e399ba2a9701024865da1c5))

## [2.20.2](https://github.com/instana/nodejs/compare/v2.20.1...v2.20.2) (2023-04-06)

### Bug Fixes

- **shared-metrics:** fixed package.json not being found when app is ESM ([#749](https://github.com/instana/nodejs/issues/749)) ([c15569c](https://github.com/instana/nodejs/commit/c15569c6a866bd109d69f7cf748767b55eb82397))

## [2.20.1](https://github.com/instana/nodejs/compare/v2.20.0...v2.20.1) (2023-03-30)

### Bug Fixes

- **amqp:** publish span not being transmitted when confirm cb is missing ([#745](https://github.com/instana/nodejs/issues/745)) ([6dce419](https://github.com/instana/nodejs/commit/6dce41905953c3b157b15b1d46a37d1db4ede389))

# [2.20.0](https://github.com/instana/nodejs/compare/v2.19.0...v2.20.0) (2023-03-24)

### Features

- **collector:** added support for amqplib 0.10.x ([b56a827](https://github.com/instana/nodejs/commit/b56a82791a1b62eed57232df9c2df699b0a4f863))

# [2.19.0](https://github.com/instana/nodejs/compare/v2.18.1...v2.19.0) (2023-03-17)

### Features

- **collector:** added support for @google-cloud/storage@6 ([#727](https://github.com/instana/nodejs/issues/727)) ([efcd4f1](https://github.com/instana/nodejs/commit/efcd4f1859ce0107976908658dda1e2113108a1c))

## [2.18.1](https://github.com/instana/nodejs/compare/v2.18.0...v2.18.1) (2023-03-06)

### Bug Fixes

- **grpc-js:** capture the correct destination host per grpc-js client ([5bc3188](https://github.com/instana/nodejs/commit/5bc31889f45b98e927f97ffebbda238a226494fb))
- **grpc-js:** do not mark cancelled calls as erroneous ([fea8b80](https://github.com/instana/nodejs/commit/fea8b80d51ab928c70efb884ac6cbfc24e7c46a5))

# [2.18.0](https://github.com/instana/nodejs/compare/v2.17.0...v2.18.0) (2023-02-28)

### Features

- **collector:** added support for @elastic/elasticsearch v8 ([#707](https://github.com/instana/nodejs/issues/707)) ([dae00bb](https://github.com/instana/nodejs/commit/dae00bb329a95efcdab1e49401958383703427e2))
- **tracing:** improve robustness of custom service naming ([aadcbff](https://github.com/instana/nodejs/commit/aadcbff6f4c2a4264f9920a26723d3e2530c0c73))

# [2.17.0](https://github.com/instana/nodejs/compare/v2.16.0...v2.17.0) (2023-02-20)

### Features

- **collector:** added support for nats 2.x including trace correlation ([#702](https://github.com/instana/nodejs/issues/702)) ([86a2685](https://github.com/instana/nodejs/commit/86a2685cfaa6e75dc855527714f50960e7d3504a))

# [2.16.0](https://github.com/instana/nodejs/compare/v2.15.0...v2.16.0) (2023-02-13)

### Features

- **collector:** added support for sqs-consumer@6.2.0 ([#691](https://github.com/instana/nodejs/issues/691)) ([f8bf9e7](https://github.com/instana/nodejs/commit/f8bf9e79d856a9c449161e76783fd36d02c3ffb0))

# [2.15.0](https://github.com/instana/nodejs/compare/v2.14.2...v2.15.0) (2023-01-27)

### Features

- **tracing, fetch:** instrument native fetch ([1a48168](https://github.com/instana/nodejs/commit/1a48168d32b5325041542cfbb41c84775ff1e518))

## [2.14.2](https://github.com/instana/nodejs/compare/v2.14.1...v2.14.2) (2023-01-16)

**Note:** Version bump only for package @instana/core

## [2.14.1](https://github.com/instana/nodejs/compare/v2.14.0...v2.14.1) (2023-01-12)

### Bug Fixes

- **collector:** fixed package.json not being found when app is ESM ([#678](https://github.com/instana/nodejs/issues/678)) ([0dbd0a2](https://github.com/instana/nodejs/commit/0dbd0a223344dabc49c559ba92e383b2356d5323))
- **collector:** mysql2/promise not working with ESM ([f059047](https://github.com/instana/nodejs/commit/f059047d8be41230a9bf5ec9fb320a58c055c630))

# [2.14.0](https://github.com/instana/nodejs/compare/v2.13.2...v2.14.0) (2023-01-02)

### Features

- **collector:** tracing all spans when client app is using ES modules ([#672](https://github.com/instana/nodejs/issues/672)) ([7d471ff](https://github.com/instana/nodejs/commit/7d471ff751fbd29ce1c96a752304ec3399d0c78c))

## [2.13.2](https://github.com/instana/nodejs/compare/v2.13.1...v2.13.2) (2022-12-14)

**Note:** Version bump only for package @instana/core

## [2.13.1](https://github.com/instana/nodejs/compare/v2.13.0...v2.13.1) (2022-12-12)

### Bug Fixes

- **collector:** resolved elasticsearch legacy error ([ea4f59f](https://github.com/instana/nodejs/commit/ea4f59f37a57e2fc88855bc89ac47775dd1048b4))

# [2.13.0](https://github.com/instana/nodejs/compare/v2.12.0...v2.13.0) (2022-12-07)

### Bug Fixes

- **collector:** improved capturing object logging via bunyan ([#664](https://github.com/instana/nodejs/issues/664)) ([d0f16d1](https://github.com/instana/nodejs/commit/d0f16d136eaa5695fdf4128314a9c34a03e2a50b))

# [2.12.0](https://github.com/instana/nodejs/compare/v2.11.1...v2.12.0) (2022-11-22)

**Note:** Version bump only for package @instana/core

## [2.11.1](https://github.com/instana/nodejs/compare/v2.11.0...v2.11.1) (2022-11-09)

### Bug Fixes

- **sdk:** work around memory leak with recursive SDK usage ([c9b35eb](https://github.com/instana/nodejs/commit/c9b35eb37f1e41f7b11442dd408ca53f5cb2ac13))

# [2.11.0](https://github.com/instana/nodejs/compare/v2.10.0...v2.11.0) (2022-11-04)

### Features

- **tracing:** instrument prisma (ORM) ([ec760f7](https://github.com/instana/nodejs/commit/ec760f7af0abaa0946276fb2ff09aa0398ab761b))

# [2.10.0](https://github.com/instana/nodejs/compare/v2.9.0...v2.10.0) (2022-10-06)

### Features

- **collector:** added support for redis v4 ([#627](https://github.com/instana/nodejs/issues/627)) ([ad00255](https://github.com/instana/nodejs/commit/ad00255c73bc7ec080a1a91172a8878febe274b2))
- **kafka:** use kafka header format 'both' by default ([b2585cf](https://github.com/instana/nodejs/commit/b2585cf7e4c6f31b38d486505699309cb9d759d6))

# [2.9.0](https://github.com/instana/nodejs/compare/v2.8.1...v2.9.0) (2022-09-26)

**Note:** Version bump only for package @instana/core

## [2.8.1](https://github.com/instana/nodejs/compare/v2.8.0...v2.8.1) (2022-09-21)

### Bug Fixes

- **redis:** suppress error for unsupported redis@4 ([ffad2c2](https://github.com/instana/nodejs/commit/ffad2c2f09ae3672d158bb141c98c38c82a59139))

# [2.8.0](https://github.com/instana/nodejs/compare/v2.7.1...v2.8.0) (2022-09-20)

### Bug Fixes

- **db2:** redact password also from the end of the connection string ([ac4c46d](https://github.com/instana/nodejs/commit/ac4c46db11298dcdcc12017e4543972a93263f84)), closes [#614](https://github.com/instana/nodejs/issues/614)

### Features

- **dynamodb:** capture region as annotation ([4ba64f4](https://github.com/instana/nodejs/commit/4ba64f4d8155b365c0fd4540c1abdbe15b572fb5))

## [2.7.1](https://github.com/instana/nodejs/compare/v2.7.0...v2.7.1) (2022-09-05)

### Bug Fixes

- **sqs, sns:** do not add message attributes if that would violate limit ([23c8ca1](https://github.com/instana/nodejs/commit/23c8ca15f82d2e9ea917d710311f6261bbbd6a53))

# 2.7.0 (2022-08-31)

### Features

- **aws-lambda:** added support for arm64 architecture ([#605](https://github.com/instana/nodejs/issues/605)) ([03dd47a](https://github.com/instana/nodejs/commit/03dd47a76d894310ce93063f4e26fd1e667be655)), closes [#596](https://github.com/instana/nodejs/issues/596)

## 2.6.2 (2022-08-17)

**Note:** Version bump only for package @instana/core

## [2.6.1](https://github.com/instana/nodejs/compare/v2.6.0...v2.6.1) (2022-08-09)

**Note:** Version bump only for package @instana/core

# [2.6.0](https://github.com/instana/nodejs/compare/v2.5.0...v2.6.0) (2022-06-28)

**Note:** Version bump only for package @instana/core

# [2.5.0](https://github.com/instana/nodejs/compare/v2.4.0...v2.5.0) (2022-06-23)

### Features

- **core:** added ability to complete specific intermediate spans ([#564](https://github.com/instana/nodejs/issues/564)) ([480ee46](https://github.com/instana/nodejs/commit/480ee4693e91bbcfd11824f42dff31ca7898cba3)), closes [#561](https://github.com/instana/nodejs/issues/561)
- **sdk:** add methods to set the EUM correlation ID/type on the span ([727916c](https://github.com/instana/nodejs/commit/727916c7398219c292faad6e374d57a3838472d2))

# [2.4.0](https://github.com/instana/nodejs/compare/v2.3.0...v2.4.0) (2022-05-25)

### Features

- added node 18 support ([#529](https://github.com/instana/nodejs/issues/529)) ([b355a7c](https://github.com/instana/nodejs/commit/b355a7ca225bf9a06841619aae64bdefa1c0957a))

# [2.3.0](https://github.com/instana/nodejs/compare/v2.2.0...v2.3.0) (2022-05-24)

### Bug Fixes

- **http:** only capture response status/headers when they have been sent ([850b8e4](https://github.com/instana/nodejs/commit/850b8e43f93749e422e9923c10cef9a8d1e2f3ea)), closes [#548](https://github.com/instana/nodejs/issues/548)
- **kafkajs:** use long trace IDs with new Kafka message headers ([5674b08](https://github.com/instana/nodejs/commit/5674b086b1481e0aaf7c352924fbd45634456461))
- **rdkafka:** use long trace IDs with new Kafka message headers ([9c47349](https://github.com/instana/nodejs/commit/9c47349b5de214828c075eded71242a32c1f26c8))

### Features

- **kafkajs:** remove Instana headers on arrival ([f65bc75](https://github.com/instana/nodejs/commit/f65bc753667c8aaf636b0c0c6100f772338e639c))

# [2.2.0](https://github.com/instana/nodejs/compare/v2.1.0...v2.2.0) (2022-05-18)

### Bug Fixes

- **agent:** reduce log level for sending data from debug to trace ([8b57a71](https://github.com/instana/nodejs/commit/8b57a71eb9818f83acbdc8f9bf63623a7e415d07))

### Features

- **tracing:** added instrumentation for ibm db2 ([#532](https://github.com/instana/nodejs/issues/532)) ([0d0b1e0](https://github.com/instana/nodejs/commit/0d0b1e0d4409795206613c4c2cdcf1e270772dd8))

# [2.1.0](https://github.com/instana/nodejs/compare/v2.0.0...v2.1.0) (2022-04-28)

### Bug Fixes

- **tracing:** cancel sqs entry span sync when no messages are available ([8a66277](https://github.com/instana/nodejs/commit/8a662773716832469aeb1b512b5225043c5f344f))
- fix duplicated logger names and prevent them ([9d576c5](https://github.com/instana/nodejs/commit/9d576c54b97e9999820e0c597ec3fd10d3c660e2))
- **tracing:** implement updateConfig for Kafka instrumentations ([c386ee6](https://github.com/instana/nodejs/commit/c386ee6c01e96a605c39c54c464f41e5c8ee65af))

### Features

- **sdk:** expose span.cancel method ([d60571f](https://github.com/instana/nodejs/commit/d60571f680c8d9c2b68ece84930a6aa91bd77b6a))
- **tracing:** use new common tracing config from from agent response ([7f8825f](https://github.com/instana/nodejs/commit/7f8825f4eddb585595457378cfb2fb36eb868a37))

# [2.0.0](https://github.com/instana/nodejs/compare/v1.140.1...v2.0.0) (2022-04-04)

### Bug Fixes

- remove npm package instana-nodejs-sensor ([5fb9f18](https://github.com/instana/nodejs/commit/5fb9f1807998fb3335652d135eb167dc13f9221d))
- removed disableAutomaticTracing legacy config ([#432](https://github.com/instana/nodejs/issues/432)) ([922d168](https://github.com/instana/nodejs/commit/922d168855000f108d23daeb4e267037098ccc1f))
- removed legacy support for config.timeBetweenHealthcheckCalls ([#476](https://github.com/instana/nodejs/issues/476)) ([66eff69](https://github.com/instana/nodejs/commit/66eff6905f0fa4e55987c931345df88eb9fcf114))
- self-disable if detected Node.js runtime version is too old ([cfe4248](https://github.com/instana/nodejs/commit/cfe4248a9a107165f8e96dbcb1948b399527d244))

### BREAKING CHANGES

- Removed support for legacy config `instana({ timeBetweenHealthcheckCalls: ... })`.
  Use `instana({ metrics: { timeBetweenHealthcheckCalls: ...}})`.
- Starting with version 2.0.0, consumers of the package who
  still use the deprecated package name instana-nodejs-sensor will need to follow
  https://www.ibm.com/docs/en/obi/current?topic=nodejs-collector-installation#change-of-package-name
  to receive updates in the future.
- Removed "disableAutomaticTracing" config option.
  Use `instana({ automaticTracingEnabled: Boolean })`.

## [1.140.1](https://github.com/instana/nodejs/compare/v1.140.0...v1.140.1) (2022-04-04)

### Bug Fixes

- **metrics:** do not report metrics from worker threads ([#517](https://github.com/instana/nodejs/issues/517)) ([bdf7869](https://github.com/instana/nodejs/commit/bdf7869e08d039e5769131d958e1037dc1748cd1)), closes [#500](https://github.com/instana/nodejs/issues/500)

# [1.140.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.140.0) (2022-03-24)

### Bug Fixes

- **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))

### Features

- **collector:** added instrumentation for @grpc/grpc-js ([d12e386](https://github.com/instana/nodejs/commit/d12e386e95ced2c68d2d549dff83ea3ecfe51735)), closes [#87653](https://github.com/instana/nodejs/issues/87653)
- **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))

# [1.139.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.139.0) (2022-03-09)

### Bug Fixes

- **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))

### Features

- **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))

# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)

### Bug Fixes

- **tracing:** fix version constraint for http2 instrumentation ([50f380f](https://github.com/instana/nodejs/commit/50f380f82bb877529daec51fbb16226a8b434751)), closes [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8) [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8)

## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)

**Note:** Version bump only for package @instana/core

## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)

### Bug Fixes

- **tracing:** fix vendoring of emitter-listener for legacy cls context ([440fd32](https://github.com/instana/nodejs/commit/440fd3218a37bc333da26c2365bfc1116a931b9b))

## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)

### Bug Fixes

- **aws-sdk/v3:** added support for @aws-sdk/\* 3.4x ([61cc179](https://github.com/instana/nodejs/commit/61cc17945279f4f0996f87e2d955fc4daf519d24))
- **tracing:** fix context loss when cls-hooked#bindEmitter is used ([2743047](https://github.com/instana/nodejs/commit/2743047b79533f5d54233e23ecfce40635bc9981)), closes [#438](https://github.com/instana/nodejs/issues/438)

## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)

### Bug Fixes

- **tracing:** require @elastic/elasticsearch/api in a safe way ([8ba1bd1](https://github.com/instana/nodejs/commit/8ba1bd1d6fb082a9ec131ff15e8df17c7b18e116))

## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)

### Bug Fixes

- **dependency:** pinned lru-cache to 6.0.0 ([0ceb372](https://github.com/instana/nodejs/commit/0ceb372709bd53d0c6cab2060d8cdaf431133706))
- **dependency:** pinned semver to 7.3.3 ([d32f23e](https://github.com/instana/nodejs/commit/d32f23ea6807989d57ec6165c407b64e04d8d7c1))
