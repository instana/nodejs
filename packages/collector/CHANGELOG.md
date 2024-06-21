# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.12.0](https://github.com/instana/nodejs/compare/v3.11.0...v3.12.0) (2024-06-21)

### Features

- added support for mssql v11 ([#1195](https://github.com/instana/nodejs/issues/1195)) ([d9dd2ac](https://github.com/instana/nodejs/commit/d9dd2ac9b15c3f8d29a3871c3c2eb896520ecb6a))

# [3.11.0](https://github.com/instana/nodejs/compare/v3.10.0...v3.11.0) (2024-06-13)

**Note:** Version bump only for package @instana/collector

# [3.10.0](https://github.com/instana/nodejs/compare/v3.9.0...v3.10.0) (2024-06-13)

**Note:** Version bump only for package @instana/collector

# [3.9.0](https://github.com/instana/nodejs/compare/v3.8.1...v3.9.0) (2024-05-28)

### Features

- added support for got v12, v13, v14 ([#1157](https://github.com/instana/nodejs/issues/1157)) ([1333a3c](https://github.com/instana/nodejs/commit/1333a3c34ede5444608b6b76e810f474c5496249))
- added support for node-fetch v3 ([#1160](https://github.com/instana/nodejs/issues/1160)) ([b96f30c](https://github.com/instana/nodejs/commit/b96f30cfd80680917fc6993e2e47cd86102fd1be))

## [3.8.1](https://github.com/instana/nodejs/compare/v3.8.0...v3.8.1) (2024-05-17)

**Note:** Version bump only for package @instana/collector

# [3.8.0](https://github.com/instana/nodejs/compare/v3.7.0...v3.8.0) (2024-05-06)

### Features

- added support for restify v9, v10, v11 ([#1140](https://github.com/instana/nodejs/issues/1140)) ([fb132d2](https://github.com/instana/nodejs/commit/fb132d2bf898cc943d9415e766a048cfd0846cb2))

# [3.7.0](https://github.com/instana/nodejs/compare/v3.6.0...v3.7.0) (2024-05-03)

### Features

- **autoprofile:** added prebuilds for darwin/arm64 linux/arm64 linux/arm ([#1135](https://github.com/instana/nodejs/issues/1135)) ([26f85b0](https://github.com/instana/nodejs/commit/26f85b08984e1155ca1df63db28fb1c6adcf752e))

# [3.6.0](https://github.com/instana/nodejs/compare/v3.5.0...v3.6.0) (2024-04-29)

### Features

- added support for node-rdkafka v3 ([#1123](https://github.com/instana/nodejs/issues/1123)) ([a519d75](https://github.com/instana/nodejs/commit/a519d75bec6798f0891365752b15c8df9a80a9db))
- added support for pino v9 ([#1130](https://github.com/instana/nodejs/issues/1130)) ([6a6565c](https://github.com/instana/nodejs/commit/6a6565c7463bb820d6495d07728dba0b12aa5156))

# [3.5.0](https://github.com/instana/nodejs/compare/v3.4.0...v3.5.0) (2024-04-24)

### Features

- added support for prisma v5 ([#1114](https://github.com/instana/nodejs/issues/1114)) ([7cf8d90](https://github.com/instana/nodejs/commit/7cf8d90bd57b06110ea49e567be9f8a4d860b5a5))

# [3.4.0](https://github.com/instana/nodejs/compare/v3.3.1...v3.4.0) (2024-04-16)

### Features

- added azure blob instrumentation ([#967](https://github.com/instana/nodejs/issues/967)) ([8b3264a](https://github.com/instana/nodejs/commit/8b3264aa3afcadd87faeb048564ef3af7a8483d0))

## [3.3.1](https://github.com/instana/nodejs/compare/v3.3.0...v3.3.1) (2024-04-11)

### Bug Fixes

- resolved esm loader issue for manual instrumentation node v18.19.0 and above ([#1063](https://github.com/instana/nodejs/issues/1063)) ([d69aff8](https://github.com/instana/nodejs/commit/d69aff86016a8b671a4ca97956d910b0ad51c99a))
- **security:** resolved security vulnerability in the tar package. ([#1106](https://github.com/instana/nodejs/issues/1106)) ([d863aa8](https://github.com/instana/nodejs/commit/d863aa8acae7b891cd625c92b6dbc5bf8b2c4f1b))

# [3.3.0](https://github.com/instana/nodejs/compare/v3.2.1...v3.3.0) (2024-03-22)

### Bug Fixes

- resolved relative URL issue in sanitizeUrl method ([a2fac29](https://github.com/instana/nodejs/commit/a2fac29a619d83aa9cc8af69a717a4a8b603da2f))

### Features

- added support for mongoose v8 ([#1083](https://github.com/instana/nodejs/issues/1083)) ([3996301](https://github.com/instana/nodejs/commit/3996301c6ce7614b7097f5fdf9007ff82eba6dc5))

## [3.2.1](https://github.com/instana/nodejs/compare/v3.2.0...v3.2.1) (2024-03-18)

### Bug Fixes

- **collector:** gracefully shutdown if core module process is not ava… ([#1070](https://github.com/instana/nodejs/issues/1070)) ([3d8196d](https://github.com/instana/nodejs/commit/3d8196d7253c8460e5f704470133f402fc558964))
- matrix parameters included in URLs ([#1069](https://github.com/instana/nodejs/issues/1069)) ([f1d2862](https://github.com/instana/nodejs/commit/f1d2862613bec31ee45bd7c0380dd2719d36f53f))

# [3.2.0](https://github.com/instana/nodejs/compare/v3.1.3...v3.2.0) (2024-02-27)

### Bug Fixes

- depreacted request-promise module ([#1017](https://github.com/instana/nodejs/issues/1017)) ([6bb88dd](https://github.com/instana/nodejs/commit/6bb88dd4ca08d2482ff917fb3b9f884f4e4bdf8e))

### Features

- added otel instrumentation for tedious ([#1030](https://github.com/instana/nodejs/issues/1030)) ([87de73d](https://github.com/instana/nodejs/commit/87de73dd5b290a76663405822dc7845315e1d18d))
- added support for ibm_db v3 ([5d1b9fe](https://github.com/instana/nodejs/commit/5d1b9fecf258e730d3a4fb570daf53b8f61eb0d7))

## [3.1.3](https://github.com/instana/nodejs/compare/v3.1.2...v3.1.3) (2024-01-31)

**Note:** Version bump only for package @instana/collector

## [3.1.2](https://github.com/instana/nodejs/compare/v3.1.1...v3.1.2) (2024-01-29)

### Bug Fixes

- deprecated request module ([#1004](https://github.com/instana/nodejs/issues/1004)) ([8bd41a9](https://github.com/instana/nodejs/commit/8bd41a9fd9e7650b6076837b5c40eb73dbc293ba))
- deprecated request-promise-native ([#1016](https://github.com/instana/nodejs/issues/1016)) ([34fa412](https://github.com/instana/nodejs/commit/34fa412b7d39af9c5caf3a545771aee3ce3aa07a))

## [3.1.1](https://github.com/instana/nodejs/compare/v3.1.0...v3.1.1) (2024-01-10)

**Note:** Version bump only for package @instana/collector

# [3.1.0](https://github.com/instana/nodejs/compare/v3.0.0...v3.1.0) (2024-01-04)

### Bug Fixes

- updated code formats ([#971](https://github.com/instana/nodejs/issues/971)) ([0e24014](https://github.com/instana/nodejs/commit/0e2401484079c1bb8a35a67ecc67408364dd6cd4))

# [3.0.0](https://github.com/instana/nodejs/compare/v2.36.1...v3.0.0) (2023-12-12)

### Bug Fixes

- dropped node v10 and v12 ([#933](https://github.com/instana/nodejs/issues/933)) ([7e3ee32](https://github.com/instana/nodejs/commit/7e3ee32f7ef2ca60259eae40fd16ff24a6ec631b))

### Build System

- deprecated kafka-node ([1274419](https://github.com/instana/nodejs/commit/1274419e27366254836edd1398032d5f188b11ef))
- dropped elasticsearch library ([e1f480d](https://github.com/instana/nodejs/commit/e1f480d835ab94c3a45c849739e32a25d3106d16))
- dropped fastify v1 ([fe247b3](https://github.com/instana/nodejs/commit/fe247b395aec6bb490eaf556142eeb2e7aba9ea0))
- dropped graphql v14 ([c4b3366](https://github.com/instana/nodejs/commit/c4b336699bf2a8cd4062034a573e0a31a30c6847))
- dropped gRPC library ([acbfa27](https://github.com/instana/nodejs/commit/acbfa27ef1ab813b52bec8f458cb19257d89c147))
- dropped mssql v8 ([6c58f51](https://github.com/instana/nodejs/commit/6c58f5184007c9aa01c372fe0bab6c1f4b21c388))
- dropped redis v0 ([e4db474](https://github.com/instana/nodejs/commit/e4db4744a15c5d8670799d52c6f183dc3e522fc4))

### Features

- **node-v21:** added support for node v21 ([#947](https://github.com/instana/nodejs/issues/947)) ([64cc797](https://github.com/instana/nodejs/commit/64cc797ee04056930d9740a7a92d5604abd461d1))

### BREAKING CHANGES

- Dropped support for fastify v1.
- Deprecated kafka-node library. Support will be removed in the next major release.
- Dropped support for node-redis v0 (https://github.com/redis/node-redis)
- Dropped support for mssql v8 (https://github.com/tediousjs/node-mssql)
- Dropped support for graphql v14 (https://github.com/graphql/graphql-js)
- Dropped elasticsearch lib support (https://www.npmjs.com/package/elasticsearch)
- Dropped support for gRPC lib (https://www.npmjs.com/package/grpc)
- Dropped Node v10 & v12 support.

## [2.36.1](https://github.com/instana/nodejs/compare/v2.36.0...v2.36.1) (2023-12-04)

**Note:** Version bump only for package @instana/collector

# [2.36.0](https://github.com/instana/nodejs/compare/v2.35.0...v2.36.0) (2023-11-29)

### Bug Fixes

- **fetch:** fix header handling for native fetch for Node.js >= 20.10.0 ([ece1a9a](https://github.com/instana/nodejs/commit/ece1a9a0ba346cd12ad060b2f0827979f03dcb95))

### Features

- **sqs-consumer:** added v7 support for sqs-consumer ([#941](https://github.com/instana/nodejs/issues/941)) ([5394726](https://github.com/instana/nodejs/commit/539472675daaecc4d944da01d56e8253a773251e))

# [2.35.0](https://github.com/instana/nodejs/compare/v2.34.1...v2.35.0) (2023-11-14)

### Bug Fixes

- **couchbase:** added missing bucket type and name for bucket.query ([#922](https://github.com/instana/nodejs/issues/922)) ([fc2a9c0](https://github.com/instana/nodejs/commit/fc2a9c0e6b71e23a2106eb1de11d55a049a8ed9e))

### Features

- **fastify:** added support for fastify v4 ([#920](https://github.com/instana/nodejs/issues/920)) ([fb22cb7](https://github.com/instana/nodejs/commit/fb22cb701579ba13271e42069f4a5dd860b42a79))
- **google cloud storage:** added support for google cloud storage v7 ([#913](https://github.com/instana/nodejs/issues/913)) ([33be8da](https://github.com/instana/nodejs/commit/33be8da7f327bb15c96594b44e01b6b9ed0eefdc))

## [2.34.1](https://github.com/instana/nodejs/compare/v2.34.0...v2.34.1) (2023-10-23)

**Note:** Version bump only for package @instana/collector

# [2.34.0](https://github.com/instana/nodejs/compare/v2.33.1...v2.34.0) (2023-10-10)

### Features

- added support for aws sdk v3 lambda ([#871](https://github.com/instana/nodejs/issues/871)) ([eb85c91](https://github.com/instana/nodejs/commit/eb85c91228144084191d12589f3b1152f6e2529d))

### Reverts

- Revert "chore: migrated to npm workspaces and lerna v7 (#876)" ([763ac7e](https://github.com/instana/nodejs/commit/763ac7e69d56742009e18964d267313918813c80)), closes [#876](https://github.com/instana/nodejs/issues/876)

## [2.33.1](https://github.com/instana/nodejs/compare/v2.33.0...v2.33.1) (2023-09-26)

**Note:** Version bump only for package @instana/collector

# [2.33.0](https://github.com/instana/nodejs/compare/v2.32.0...v2.33.0) (2023-09-18)

### Features

- **aws:** added support for sns v3 ([#860](https://github.com/instana/nodejs/issues/860)) ([bd3e755](https://github.com/instana/nodejs/commit/bd3e7554fe21188c3ad10d442e4d72546d5c2267))

# [2.32.0](https://github.com/instana/nodejs/compare/v2.31.0...v2.32.0) (2023-09-11)

**Note:** Version bump only for package @instana/collector

# [2.31.0](https://github.com/instana/nodejs/compare/v2.30.2...v2.31.0) (2023-09-04)

### Features

- added support for batch write dynamodb ([#858](https://github.com/instana/nodejs/issues/858)) ([a276b84](https://github.com/instana/nodejs/commit/a276b843441eacd2b9451a21780375c44d24d613))

## [2.30.2](https://github.com/instana/nodejs/compare/v2.30.1...v2.30.2) (2023-08-28)

### Bug Fixes

- **dynamodb:** resolved all operation names ([#853](https://github.com/instana/nodejs/issues/853)) ([c7b17eb](https://github.com/instana/nodejs/commit/c7b17ebb1264add14c43e8585aea805912e3b351))

## [2.30.1](https://github.com/instana/nodejs/compare/v2.30.0...v2.30.1) (2023-08-25)

### Bug Fixes

- **core:** resolved missing dynamodb spans ([#851](https://github.com/instana/nodejs/issues/851)) ([7444a90](https://github.com/instana/nodejs/commit/7444a90c03e9a8582c7ed66b805f397ecab28955))

# [2.30.0](https://github.com/instana/nodejs/compare/v2.29.0...v2.30.0) (2023-08-16)

### Features

- aws sdk v3 kinesis instrumentation ([#838](https://github.com/instana/nodejs/issues/838)) ([eae677c](https://github.com/instana/nodejs/commit/eae677cdba02c63cc310f3d4de6d5a4bdec1a298))

# [2.29.0](https://github.com/instana/nodejs/compare/v2.28.0...v2.29.0) (2023-07-31)

### Bug Fixes

- **tracing:** normalize incoming trace/span IDs from upstream tracers ([01e26d1](https://github.com/instana/nodejs/commit/01e26d110eb26b9143f33126f68e5594b00b32ea)), closes [#833](https://github.com/instana/nodejs/issues/833)

# [2.28.0](https://github.com/instana/nodejs/compare/v2.27.0...v2.28.0) (2023-07-27)

**Note:** Version bump only for package @instana/collector

# [2.27.0](https://github.com/instana/nodejs/compare/v2.26.3...v2.27.0) (2023-07-24)

**Note:** Version bump only for package @instana/collector

## [2.26.3](https://github.com/instana/nodejs/compare/v2.26.2...v2.26.3) (2023-07-20)

**Note:** Version bump only for package @instana/collector

## [2.26.2](https://github.com/instana/nodejs/compare/v2.26.1...v2.26.2) (2023-07-17)

**Note:** Version bump only for package @instana/collector

## [2.26.1](https://github.com/instana/nodejs/compare/v2.26.0...v2.26.1) (2023-07-10)

**Note:** Version bump only for package @instana/collector

# [2.26.0](https://github.com/instana/nodejs/compare/v2.25.3...v2.26.0) (2023-07-04)

### Features

- added support for Node v20 (ESM not working yet) ([#805](https://github.com/instana/nodejs/issues/805)) ([830259f](https://github.com/instana/nodejs/commit/830259f1267e0e2f77208f607fdb15a8d520953e))

## [2.25.3](https://github.com/instana/nodejs/compare/v2.25.2...v2.25.3) (2023-06-27)

**Note:** Version bump only for package @instana/collector

## [2.25.2](https://github.com/instana/nodejs/compare/v2.25.1...v2.25.2) (2023-06-22)

### Bug Fixes

- **sdk:** do not overwrite span.ec after it has been set via the SDK ([4283cdf](https://github.com/instana/nodejs/commit/4283cdf962505d5471d3b849137f36a7134ae740))

## [2.25.1](https://github.com/instana/nodejs/compare/v2.25.0...v2.25.1) (2023-06-19)

**Note:** Version bump only for package @instana/collector

# [2.25.0](https://github.com/instana/nodejs/compare/v2.24.0...v2.25.0) (2023-06-16)

### Features

- **sdk:** add method to mark the current span as erroneous ([2cfcc7b](https://github.com/instana/nodejs/commit/2cfcc7b921518b4dc174b8296cff0122f523d532))

# [2.24.0](https://github.com/instana/nodejs/compare/v2.23.0...v2.24.0) (2023-06-13)

### Bug Fixes

- **announce:** verify connection to Instana host agent via payload check ([ae1b41c](https://github.com/instana/nodejs/commit/ae1b41c93392f8ad3a15ef3f809d2f5cfbfddbc8))

### Features

- **collector:** added node:fs, restify and socket.io support (OpenTelemetry integration) ([#715](https://github.com/instana/nodejs/issues/715)) ([60f3bb9](https://github.com/instana/nodejs/commit/60f3bb960f909e0640b372de97c8f6d7c1654038)), closes [#109122](https://github.com/instana/nodejs/issues/109122)

# [2.23.0](https://github.com/instana/nodejs/compare/v2.22.1...v2.23.0) (2023-06-06)

**Note:** Version bump only for package @instana/collector

## [2.22.1](https://github.com/instana/nodejs/compare/v2.22.0...v2.22.1) (2023-05-15)

### Bug Fixes

- **db2:** ensure span is correctly processed as an IBM DB2 span ([de3a8b4](https://github.com/instana/nodejs/commit/de3a8b4e2241fe089cb1938b6eb955057ec2b33e))
- **sqs:** fix missing async context in recent aws-sdk/client-sqs version ([6ae90e7](https://github.com/instana/nodejs/commit/6ae90e74fee5c47cc4ade67d21c4885d34c08847))

# [2.22.0](https://github.com/instana/nodejs/compare/v2.21.1...v2.22.0) (2023-05-09)

### Bug Fixes

- **announce:** remove obsolete check for Server header ([7d6a05b](https://github.com/instana/nodejs/commit/7d6a05bc24e3b85df4bfee831f0a6e495ae7dedd))
- **collector:** keep EOL events open instead of recreating them ([6de9965](https://github.com/instana/nodejs/commit/6de9965c5fb667027a3b84fbd15aec3f591f32d5))

### Features

- **mongodb:** add support for mongodb v4, v5 & mongoose v6 & v7 ([4e80a26](https://github.com/instana/nodejs/commit/4e80a2680d3a438280aefa1ab8623e36ca17c290))
- **w3c:** support W3C trace context level 2 ([62e0f99](https://github.com/instana/nodejs/commit/62e0f99710fe3299f6c9825358221f5d065be50d))

## [2.21.1](https://github.com/instana/nodejs/compare/v2.21.0...v2.21.1) (2023-05-02)

### Bug Fixes

- **announce:** fix timeout for host agent lookup ([d4e440f](https://github.com/instana/nodejs/commit/d4e440fd91ce8a8d14e5ce90e819a7259a7c9442))
- **db2:** capture the correct destination dsn per client ([9529690](https://github.com/instana/nodejs/commit/9529690070871fddd2d31b0b646badc320dde56b))
- **elasticsearch:** capture the correct destination host per client ([cc23d05](https://github.com/instana/nodejs/commit/cc23d057a9d60a3a179e20451e0bc336e3c9a56d))
- **nats:** capture the correct destination nats address per client ([59e5ddf](https://github.com/instana/nodejs/commit/59e5ddfbbe85a724bfc040e140e63bf906706f2f))
- **nats-streaming:** capture correct destination address per client ([678d702](https://github.com/instana/nodejs/commit/678d70276dcb761eeb64dc3c848157267458192c))

# [2.21.0](https://github.com/instana/nodejs/compare/v2.20.2...v2.21.0) (2023-04-21)

### Features

- **collector:** added support for couchbase ([#737](https://github.com/instana/nodejs/issues/737)) ([3239b19](https://github.com/instana/nodejs/commit/3239b196eb54d7ea1e399ba2a9701024865da1c5))

## [2.20.2](https://github.com/instana/nodejs/compare/v2.20.1...v2.20.2) (2023-04-06)

**Note:** Version bump only for package @instana/collector

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

**Note:** Version bump only for package @instana/collector

## [2.14.1](https://github.com/instana/nodejs/compare/v2.14.0...v2.14.1) (2023-01-12)

**Note:** Version bump only for package @instana/collector

# [2.14.0](https://github.com/instana/nodejs/compare/v2.13.2...v2.14.0) (2023-01-02)

### Features

- **collector:** tracing all spans when client app is using ES modules ([#672](https://github.com/instana/nodejs/issues/672)) ([7d471ff](https://github.com/instana/nodejs/commit/7d471ff751fbd29ce1c96a752304ec3399d0c78c))

## [2.13.2](https://github.com/instana/nodejs/compare/v2.13.1...v2.13.2) (2022-12-14)

**Note:** Version bump only for package @instana/collector

## [2.13.1](https://github.com/instana/nodejs/compare/v2.13.0...v2.13.1) (2022-12-12)

**Note:** Version bump only for package @instana/collector

# [2.13.0](https://github.com/instana/nodejs/compare/v2.12.0...v2.13.0) (2022-12-07)

### Bug Fixes

- **collector:** improved capturing object logging via bunyan ([#664](https://github.com/instana/nodejs/issues/664)) ([d0f16d1](https://github.com/instana/nodejs/commit/d0f16d136eaa5695fdf4128314a9c34a03e2a50b))

# [2.12.0](https://github.com/instana/nodejs/compare/v2.11.1...v2.12.0) (2022-11-22)

**Note:** Version bump only for package @instana/collector

## [2.11.1](https://github.com/instana/nodejs/compare/v2.11.0...v2.11.1) (2022-11-09)

**Note:** Version bump only for package @instana/collector

# [2.11.0](https://github.com/instana/nodejs/compare/v2.10.0...v2.11.0) (2022-11-04)

### Features

- **tracing:** instrument prisma (ORM) ([ec760f7](https://github.com/instana/nodejs/commit/ec760f7af0abaa0946276fb2ff09aa0398ab761b))

# [2.10.0](https://github.com/instana/nodejs/compare/v2.9.0...v2.10.0) (2022-10-06)

### Features

- **collector:** added support for redis v4 ([#627](https://github.com/instana/nodejs/issues/627)) ([ad00255](https://github.com/instana/nodejs/commit/ad00255c73bc7ec080a1a91172a8878febe274b2))
- **kafka:** use kafka header format 'both' by default ([b2585cf](https://github.com/instana/nodejs/commit/b2585cf7e4c6f31b38d486505699309cb9d759d6))

# [2.9.0](https://github.com/instana/nodejs/compare/v2.8.1...v2.9.0) (2022-09-26)

**Note:** Version bump only for package @instana/collector

## [2.8.1](https://github.com/instana/nodejs/compare/v2.8.0...v2.8.1) (2022-09-21)

**Note:** Version bump only for package @instana/collector

# [2.8.0](https://github.com/instana/nodejs/compare/v2.7.1...v2.8.0) (2022-09-20)

### Features

- **dynamodb:** capture region as annotation ([4ba64f4](https://github.com/instana/nodejs/commit/4ba64f4d8155b365c0fd4540c1abdbe15b572fb5))

## [2.7.1](https://github.com/instana/nodejs/compare/v2.7.0...v2.7.1) (2022-09-05)

### Bug Fixes

- **sqs, sns:** do not add message attributes if that would violate limit ([23c8ca1](https://github.com/instana/nodejs/commit/23c8ca15f82d2e9ea917d710311f6261bbbd6a53))

# 2.7.0 (2022-08-31)

### Features

- **aws-lambda:** added support for arm64 architecture ([#605](https://github.com/instana/nodejs/issues/605)) ([03dd47a](https://github.com/instana/nodejs/commit/03dd47a76d894310ce93063f4e26fd1e667be655)), closes [#596](https://github.com/instana/nodejs/issues/596)

## 2.6.2 (2022-08-17)

**Note:** Version bump only for package @instana/collector

## [2.6.1](https://github.com/instana/nodejs/compare/v2.6.0...v2.6.1) (2022-08-09)

**Note:** Version bump only for package @instana/collector

# [2.6.0](https://github.com/instana/nodejs/compare/v2.5.0...v2.6.0) (2022-06-28)

**Note:** Version bump only for package @instana/collector

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
- **rdkafka:** use long trace IDs with new Kafka message headers ([9c47349](https://github.com/instana/nodejs/commit/9c47349b5de214828c075eded71242a32c1f26c8))

### Features

- **kafkajs:** remove Instana headers on arrival ([f65bc75](https://github.com/instana/nodejs/commit/f65bc753667c8aaf636b0c0c6100f772338e639c))

# [2.2.0](https://github.com/instana/nodejs/compare/v2.1.0...v2.2.0) (2022-05-18)

### Bug Fixes

- **agent:** reduce log level for sending data from debug to trace ([8b57a71](https://github.com/instana/nodejs/commit/8b57a71eb9818f83acbdc8f9bf63623a7e415d07))

### Features

- **agent:** read span batching option also from tracing section ([1f776d4](https://github.com/instana/nodejs/commit/1f776d46d6329f33939d65041fdc7a78246d62ea))
- **tracing:** added instrumentation for ibm db2 ([#532](https://github.com/instana/nodejs/issues/532)) ([0d0b1e0](https://github.com/instana/nodejs/commit/0d0b1e0d4409795206613c4c2cdcf1e270772dd8))

# [2.1.0](https://github.com/instana/nodejs/compare/v2.0.0...v2.1.0) (2022-04-28)

### Bug Fixes

- **tracing:** cancel sqs entry span sync when no messages are available ([8a66277](https://github.com/instana/nodejs/commit/8a662773716832469aeb1b512b5225043c5f344f))
- fix duplicated logger names and prevent them ([9d576c5](https://github.com/instana/nodejs/commit/9d576c54b97e9999820e0c597ec3fd10d3c660e2))

### Features

- **tracing:** use new common tracing config from from agent response ([7f8825f](https://github.com/instana/nodejs/commit/7f8825f4eddb585595457378cfb2fb36eb868a37))

# [2.0.0](https://github.com/instana/nodejs/compare/v1.140.1...v2.0.0) (2022-04-04)

### Bug Fixes

- dropped Node 6/8 ([0e6fd0e](https://github.com/instana/nodejs/commit/0e6fd0ef8f836ef6f2d95f3ddda2a641d92d0f86))
- remove npm package instana-nodejs-sensor ([5fb9f18](https://github.com/instana/nodejs/commit/5fb9f1807998fb3335652d135eb167dc13f9221d))
- removed disableAutomaticTracing legacy config ([#432](https://github.com/instana/nodejs/issues/432)) ([922d168](https://github.com/instana/nodejs/commit/922d168855000f108d23daeb4e267037098ccc1f))
- removed legacy support for config.timeBetweenHealthcheckCalls ([#476](https://github.com/instana/nodejs/issues/476)) ([66eff69](https://github.com/instana/nodejs/commit/66eff6905f0fa4e55987c931345df88eb9fcf114))
- removed support for passing parent logger during initialisation ([bd96791](https://github.com/instana/nodejs/commit/bd9679151388cd8c865df8910b35f7f00e1ca6de))
- removed uncaught exception config ([fb6570a](https://github.com/instana/nodejs/commit/fb6570a862dbdec776eb78b840dcdc4184cd5f00))
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
- Removed "reportUncaughtException" config option.
  The feature was completely removed.
- Removed support for passing logger to instana initialisation.
  Use `instana.setLogger(logger)`".
- v2 has dropped support for Node 6/8.

## [1.140.1](https://github.com/instana/nodejs/compare/v1.140.0...v1.140.1) (2022-04-04)

### Bug Fixes

- **metrics:** do not report metrics from worker threads ([#517](https://github.com/instana/nodejs/issues/517)) ([bdf7869](https://github.com/instana/nodejs/commit/bdf7869e08d039e5769131d958e1037dc1748cd1)), closes [#500](https://github.com/instana/nodejs/issues/500)

# [1.140.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.140.0) (2022-03-24)

### Bug Fixes

- **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))
- **collector:** work around Bazel's node-patches module ([d06e9be](https://github.com/instana/nodejs/commit/d06e9be187e9f97c43e4a129ebb2f5e18f82ef8c))

### Features

- **collector:** added instrumentation for @grpc/grpc-js ([d12e386](https://github.com/instana/nodejs/commit/d12e386e95ced2c68d2d549dff83ea3ecfe51735)), closes [#87653](https://github.com/instana/nodejs/issues/87653)
- **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))

### Reverts

- Revert "test: added tsoa framework to integration tests (#492)" ([479a3f6](https://github.com/instana/nodejs/commit/479a3f60f34c87828d2db1d515723f2aa9b076f7)), closes [#492](https://github.com/instana/nodejs/issues/492)

# [1.139.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.139.0) (2022-03-09)

### Bug Fixes

- **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))

### Features

- **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))

# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)

### Bug Fixes

- **tracing:** fix version constraint for http2 instrumentation ([50f380f](https://github.com/instana/nodejs/commit/50f380f82bb877529daec51fbb16226a8b434751)), closes [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8) [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8)

## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)

**Note:** Version bump only for package @instana/collector

## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)

**Note:** Version bump only for package @instana/collector

## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)

### Bug Fixes

- **tracing:** fix context loss when cls-hooked#bindEmitter is used ([2743047](https://github.com/instana/nodejs/commit/2743047b79533f5d54233e23ecfce40635bc9981)), closes [#438](https://github.com/instana/nodejs/issues/438)

## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)

### Bug Fixes

- **collector:** prevent initializing @instana/collector multiple times ([b3261b7](https://github.com/instana/nodejs/commit/b3261b7a653b406cbe2eeaaf9050134bbeedfac9))

## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)

### Bug Fixes

- **dependency:** pinned semver to 7.3.3 ([d32f23e](https://github.com/instana/nodejs/commit/d32f23ea6807989d57ec6165c407b64e04d8d7c1))
- **dependency:** updated tar to 6.x in shared-metrics ([#415](https://github.com/instana/nodejs/issues/415)) ([5288ba5](https://github.com/instana/nodejs/commit/5288ba5241acd23d54f11c76edb3cffc0ffe6a66))
