# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.36.2](https://github.com/instana/nodejs/compare/v2.36.1...v2.36.2) (2025-03-17)

**Note:** Version bump only for package @instana/core





## [2.36.2-beta.1](https://github.com/instana/nodejs/compare/v2.36.2-beta.0...v2.36.2-beta.1) (2025-02-20)

**Note:** Version bump only for package @instana/core





## [2.36.2-beta.0](https://github.com/instana/nodejs/compare/v2.36.1...v2.36.2-beta.0) (2025-02-20)

**Note:** Version bump only for package @instana/core





## [2.36.1](https://github.com/instana/nodejs/compare/v2.36.0...v2.36.1) (2023-12-04)


### Bug Fixes

* **fetch:** fix header handling for Node.js >= 18.19.0 and >= 21.1.0 ([6420063](https://github.com/instana/nodejs/commit/6420063932c15b44a4aa436ec522dab4c03cca54))





# [2.36.0](https://github.com/instana/nodejs/compare/v2.35.0...v2.36.0) (2023-11-29)


### Bug Fixes

* **fetch:** fix header handling for native fetch for Node.js >= 20.10.0 ([ece1a9a](https://github.com/instana/nodejs/commit/ece1a9a0ba346cd12ad060b2f0827979f03dcb95))
* **fetch:** fix trace correlation for native fetch for Node.js >= 20.8.1 ([e834c30](https://github.com/instana/nodejs/commit/e834c30ca552580e7d35041bfd99407035c5eee1))





# [2.35.0](https://github.com/instana/nodejs/compare/v2.34.1...v2.35.0) (2023-11-14)


### Bug Fixes

* **couchbase:** added missing bucket type and name for bucket.query ([#922](https://github.com/instana/nodejs/issues/922)) ([fc2a9c0](https://github.com/instana/nodejs/commit/fc2a9c0e6b71e23a2106eb1de11d55a049a8ed9e))


### Features

* **google cloud storage:** added support for google cloud storage v7 ([#913](https://github.com/instana/nodejs/issues/913)) ([33be8da](https://github.com/instana/nodejs/commit/33be8da7f327bb15c96594b44e01b6b9ed0eefdc))





## [2.34.1](https://github.com/instana/nodejs/compare/v2.34.0...v2.34.1) (2023-10-23)


### Bug Fixes

* **rdkafka:** only log warning about header format once ([#897](https://github.com/instana/nodejs/issues/897)) ([d8bf0ce](https://github.com/instana/nodejs/commit/d8bf0ce377115eeaa6c186f6447072a06f45055a))
* reduced log warnings when there is no entry span ([#891](https://github.com/instana/nodejs/issues/891)) ([8543808](https://github.com/instana/nodejs/commit/854380826eb7f67f93009fed1ed79bccc7d69508)), closes [#885](https://github.com/instana/nodejs/issues/885)





# [2.34.0](https://github.com/instana/nodejs/compare/v2.33.1...v2.34.0) (2023-10-10)


### Features

* added support for aws sdk v3 lambda ([#871](https://github.com/instana/nodejs/issues/871)) ([eb85c91](https://github.com/instana/nodejs/commit/eb85c91228144084191d12589f3b1152f6e2529d))


### Reverts

* Revert "chore: migrated to npm workspaces and lerna v7 (#876)" ([763ac7e](https://github.com/instana/nodejs/commit/763ac7e69d56742009e18964d267313918813c80)), closes [#876](https://github.com/instana/nodejs/issues/876)





## [2.33.1](https://github.com/instana/nodejs/compare/v2.33.0...v2.33.1) (2023-09-26)


### Bug Fixes

* improved how to disable aws sdk instrumentation ([#866](https://github.com/instana/nodejs/issues/866)) ([d0483c2](https://github.com/instana/nodejs/commit/d0483c2f80a5639f56cb95ef98ac8f5085aea5fc))





# [2.33.0](https://github.com/instana/nodejs/compare/v2.32.0...v2.33.0) (2023-09-18)


### Features

* **aws:** added support for sns v3  ([#860](https://github.com/instana/nodejs/issues/860)) ([bd3e755](https://github.com/instana/nodejs/commit/bd3e7554fe21188c3ad10d442e4d72546d5c2267))





# [2.32.0](https://github.com/instana/nodejs/compare/v2.31.0...v2.32.0) (2023-09-11)


### Features

* added esm support for aws fargate ([#847](https://github.com/instana/nodejs/issues/847)) ([80472de](https://github.com/instana/nodejs/commit/80472dee48287a50d6af5bb9128fc113a3d40968))





# [2.31.0](https://github.com/instana/nodejs/compare/v2.30.2...v2.31.0) (2023-09-04)


### Features

* added support for batch write dynamodb ([#858](https://github.com/instana/nodejs/issues/858)) ([a276b84](https://github.com/instana/nodejs/commit/a276b843441eacd2b9451a21780375c44d24d613))





## [2.30.2](https://github.com/instana/nodejs/compare/v2.30.1...v2.30.2) (2023-08-28)


### Bug Fixes

* **dynamodb:** resolved all operation names ([#853](https://github.com/instana/nodejs/issues/853)) ([c7b17eb](https://github.com/instana/nodejs/commit/c7b17ebb1264add14c43e8585aea805912e3b351))





## [2.30.1](https://github.com/instana/nodejs/compare/v2.30.0...v2.30.1) (2023-08-25)


### Bug Fixes

* **core:** resolved flooding log file when agent connection is not established ([#850](https://github.com/instana/nodejs/issues/850)) ([c80eca6](https://github.com/instana/nodejs/commit/c80eca642f7b36a966da2d3cebf4271bcb08ac36)), closes [#849](https://github.com/instana/nodejs/issues/849)
* **core:** resolved missing dynamodb spans ([#851](https://github.com/instana/nodejs/issues/851)) ([7444a90](https://github.com/instana/nodejs/commit/7444a90c03e9a8582c7ed66b805f397ecab28955))





# [2.30.0](https://github.com/instana/nodejs/compare/v2.29.0...v2.30.0) (2023-08-16)


### Bug Fixes

* reduced noisy log warnings when active entry could not be found ([#840](https://github.com/instana/nodejs/issues/840)) ([9ba2697](https://github.com/instana/nodejs/commit/9ba2697b97643e9314456b1fef3e1b68e6acf446))


### Features

* added ability to provide a custom package json path ([#839](https://github.com/instana/nodejs/issues/839)) ([f37d898](https://github.com/instana/nodejs/commit/f37d898bcfc5d053b70251854b40b76e396a22b8))
* aws sdk v3 kinesis instrumentation ([#838](https://github.com/instana/nodejs/issues/838)) ([eae677c](https://github.com/instana/nodejs/commit/eae677cdba02c63cc310f3d4de6d5a4bdec1a298))





# [2.29.0](https://github.com/instana/nodejs/compare/v2.28.0...v2.29.0) (2023-07-31)


### Bug Fixes

* **tracing:** normalize incoming trace/span IDs from upstream tracers ([01e26d1](https://github.com/instana/nodejs/commit/01e26d110eb26b9143f33126f68e5594b00b32ea)), closes [#833](https://github.com/instana/nodejs/issues/833)


### Features

* added support for the latest  aws sdk v3 changes ([#837](https://github.com/instana/nodejs/issues/837)) ([3936a9d](https://github.com/instana/nodejs/commit/3936a9da70752102e90cf3721e63bd83dce92151))





# [2.28.0](https://github.com/instana/nodejs/compare/v2.27.0...v2.28.0) (2023-07-27)

**Note:** Version bump only for package @instana/core





# [2.27.0](https://github.com/instana/nodejs/compare/v2.26.3...v2.27.0) (2023-07-24)


### Bug Fixes

* stack.slice not a function ([#828](https://github.com/instana/nodejs/issues/828)) ([827a722](https://github.com/instana/nodejs/commit/827a722939785ca70791e5c36de8a88a8c48423a))





## [2.26.3](https://github.com/instana/nodejs/compare/v2.26.2...v2.26.3) (2023-07-20)


### Bug Fixes

* **collector:** reduce warnings when exit span cannot be started ([#827](https://github.com/instana/nodejs/issues/827)) ([d0d82cf](https://github.com/instana/nodejs/commit/d0d82cfa4562129cf1de32afef853764e9f7d1a5))





## [2.26.2](https://github.com/instana/nodejs/compare/v2.26.1...v2.26.2) (2023-07-17)


### Bug Fixes

* skip init step when disabling individual instrumentations ([#824](https://github.com/instana/nodejs/issues/824)) ([8f8f661](https://github.com/instana/nodejs/commit/8f8f661c8dd416e94ce5e35f7b0eda81f0445c25))





## [2.26.1](https://github.com/instana/nodejs/compare/v2.26.0...v2.26.1) (2023-07-10)


### Bug Fixes

* **shared-metrics:** esm app package.json not being found when node_options is set ([#817](https://github.com/instana/nodejs/issues/817)) ([dc8f7af](https://github.com/instana/nodejs/commit/dc8f7af9b8f61bb97768eb18e36bff3fb80b6ccc))





# [2.26.0](https://github.com/instana/nodejs/compare/v2.25.3...v2.26.0) (2023-07-04)

**Note:** Version bump only for package @instana/core





## [2.25.3](https://github.com/instana/nodejs/compare/v2.25.2...v2.25.3) (2023-06-27)

**Note:** Version bump only for package @instana/core





## [2.25.2](https://github.com/instana/nodejs/compare/v2.25.1...v2.25.2) (2023-06-22)


### Bug Fixes

* **sdk:** do not overwrite span.ec after it has been set via the SDK ([4283cdf](https://github.com/instana/nodejs/commit/4283cdf962505d5471d3b849137f36a7134ae740))





## [2.25.1](https://github.com/instana/nodejs/compare/v2.25.0...v2.25.1) (2023-06-19)

**Note:** Version bump only for package @instana/core





# [2.25.0](https://github.com/instana/nodejs/compare/v2.24.0...v2.25.0) (2023-06-16)


### Features

* **sdk:** add method to mark the current span as erroneous ([2cfcc7b](https://github.com/instana/nodejs/commit/2cfcc7b921518b4dc174b8296cff0122f523d532))





# [2.24.0](https://github.com/instana/nodejs/compare/v2.23.0...v2.24.0) (2023-06-13)


### Features

* **collector:** added node:fs, restify and socket.io support (OpenTelemetry integration) ([#715](https://github.com/instana/nodejs/issues/715)) ([60f3bb9](https://github.com/instana/nodejs/commit/60f3bb960f909e0640b372de97c8f6d7c1654038)), closes [#109122](https://github.com/instana/nodejs/issues/109122)





# [2.23.0](https://github.com/instana/nodejs/compare/v2.22.1...v2.23.0) (2023-06-06)

**Note:** Version bump only for package @instana/core





## [2.22.1](https://github.com/instana/nodejs/compare/v2.22.0...v2.22.1) (2023-05-15)


### Bug Fixes

* **db2:** ensure span is correctly processed as an IBM DB2 span ([de3a8b4](https://github.com/instana/nodejs/commit/de3a8b4e2241fe089cb1938b6eb955057ec2b33e))
* **sqs:** fix missing async context in recent aws-sdk/client-sqs version ([6ae90e7](https://github.com/instana/nodejs/commit/6ae90e74fee5c47cc4ade67d21c4885d34c08847))





# [2.22.0](https://github.com/instana/nodejs/compare/v2.21.1...v2.22.0) (2023-05-09)


### Bug Fixes

* **collector:** keep EOL events open instead of recreating them ([6de9965](https://github.com/instana/nodejs/commit/6de9965c5fb667027a3b84fbd15aec3f591f32d5))


### Features

* **mongodb:** add support for mongodb v4, v5 & mongoose v6 & v7 ([4e80a26](https://github.com/instana/nodejs/commit/4e80a2680d3a438280aefa1ab8623e36ca17c290))
* **w3c:** support W3C trace context level 2 ([62e0f99](https://github.com/instana/nodejs/commit/62e0f99710fe3299f6c9825358221f5d065be50d))





## [2.21.1](https://github.com/instana/nodejs/compare/v2.21.0...v2.21.1) (2023-05-02)


### Bug Fixes

* **db2:** capture the correct destination dsn per client ([9529690](https://github.com/instana/nodejs/commit/9529690070871fddd2d31b0b646badc320dde56b))
* **elasticsearch:** capture the correct destination host per client ([cc23d05](https://github.com/instana/nodejs/commit/cc23d057a9d60a3a179e20451e0bc336e3c9a56d))
* **nats:** capture the correct destination nats address per client ([59e5ddf](https://github.com/instana/nodejs/commit/59e5ddfbbe85a724bfc040e140e63bf906706f2f))
* **nats-streaming:** capture correct destination address per client ([678d702](https://github.com/instana/nodejs/commit/678d70276dcb761eeb64dc3c848157267458192c))





# [2.21.0](https://github.com/instana/nodejs/compare/v2.20.2...v2.21.0) (2023-04-21)


### Features

* **collector:** added support for couchbase ([#737](https://github.com/instana/nodejs/issues/737)) ([3239b19](https://github.com/instana/nodejs/commit/3239b196eb54d7ea1e399ba2a9701024865da1c5))





## [2.20.2](https://github.com/instana/nodejs/compare/v2.20.1...v2.20.2) (2023-04-06)


### Bug Fixes

* **shared-metrics:** fixed package.json not being found when app is ESM ([#749](https://github.com/instana/nodejs/issues/749)) ([c15569c](https://github.com/instana/nodejs/commit/c15569c6a866bd109d69f7cf748767b55eb82397))





## [2.20.1](https://github.com/instana/nodejs/compare/v2.20.0...v2.20.1) (2023-03-30)


### Bug Fixes

* **amqp:** publish span not being transmitted when confirm cb is missing ([#745](https://github.com/instana/nodejs/issues/745)) ([6dce419](https://github.com/instana/nodejs/commit/6dce41905953c3b157b15b1d46a37d1db4ede389))





# [2.20.0](https://github.com/instana/nodejs/compare/v2.19.0...v2.20.0) (2023-03-24)


### Features

* **collector:** added support for amqplib 0.10.x ([b56a827](https://github.com/instana/nodejs/commit/b56a82791a1b62eed57232df9c2df699b0a4f863))





# [2.19.0](https://github.com/instana/nodejs/compare/v2.18.1...v2.19.0) (2023-03-17)


### Features

* **collector:** added support for @google-cloud/storage@6 ([#727](https://github.com/instana/nodejs/issues/727)) ([efcd4f1](https://github.com/instana/nodejs/commit/efcd4f1859ce0107976908658dda1e2113108a1c))





## [2.18.1](https://github.com/instana/nodejs/compare/v2.18.0...v2.18.1) (2023-03-06)


### Bug Fixes

* **grpc-js:** capture the correct destination host per grpc-js client ([5bc3188](https://github.com/instana/nodejs/commit/5bc31889f45b98e927f97ffebbda238a226494fb))
* **grpc-js:** do not mark cancelled calls as erroneous ([fea8b80](https://github.com/instana/nodejs/commit/fea8b80d51ab928c70efb884ac6cbfc24e7c46a5))





# [2.18.0](https://github.com/instana/nodejs/compare/v2.17.0...v2.18.0) (2023-02-28)


### Features

* **collector:** added support for @elastic/elasticsearch v8 ([#707](https://github.com/instana/nodejs/issues/707)) ([dae00bb](https://github.com/instana/nodejs/commit/dae00bb329a95efcdab1e49401958383703427e2))
* **tracing:** improve robustness of custom service naming ([aadcbff](https://github.com/instana/nodejs/commit/aadcbff6f4c2a4264f9920a26723d3e2530c0c73))





# [2.17.0](https://github.com/instana/nodejs/compare/v2.16.0...v2.17.0) (2023-02-20)


### Features

* **collector:** added support for nats 2.x including trace correlation ([#702](https://github.com/instana/nodejs/issues/702)) ([86a2685](https://github.com/instana/nodejs/commit/86a2685cfaa6e75dc855527714f50960e7d3504a))





# [2.16.0](https://github.com/instana/nodejs/compare/v2.15.0...v2.16.0) (2023-02-13)


### Features

* **collector:** added support for sqs-consumer@6.2.0 ([#691](https://github.com/instana/nodejs/issues/691)) ([f8bf9e7](https://github.com/instana/nodejs/commit/f8bf9e79d856a9c449161e76783fd36d02c3ffb0))





# [2.15.0](https://github.com/instana/nodejs/compare/v2.14.2...v2.15.0) (2023-01-27)


### Features

* **tracing, fetch:** instrument native fetch ([1a48168](https://github.com/instana/nodejs/commit/1a48168d32b5325041542cfbb41c84775ff1e518))





## [2.14.2](https://github.com/instana/nodejs/compare/v2.14.1...v2.14.2) (2023-01-16)

**Note:** Version bump only for package @instana/core





## [2.14.1](https://github.com/instana/nodejs/compare/v2.14.0...v2.14.1) (2023-01-12)


### Bug Fixes

* **collector:** fixed package.json not being found when app is ESM ([#678](https://github.com/instana/nodejs/issues/678)) ([0dbd0a2](https://github.com/instana/nodejs/commit/0dbd0a223344dabc49c559ba92e383b2356d5323))
* **collector:** mysql2/promise not working with ESM ([f059047](https://github.com/instana/nodejs/commit/f059047d8be41230a9bf5ec9fb320a58c055c630))





# [2.14.0](https://github.com/instana/nodejs/compare/v2.13.2...v2.14.0) (2023-01-02)


### Features

* **collector:** tracing all spans when client app is using ES modules ([#672](https://github.com/instana/nodejs/issues/672)) ([7d471ff](https://github.com/instana/nodejs/commit/7d471ff751fbd29ce1c96a752304ec3399d0c78c))





## [2.13.2](https://github.com/instana/nodejs/compare/v2.13.1...v2.13.2) (2022-12-14)

**Note:** Version bump only for package @instana/core





## [2.13.1](https://github.com/instana/nodejs/compare/v2.13.0...v2.13.1) (2022-12-12)


### Bug Fixes

* **collector:** resolved elasticsearch legacy error ([ea4f59f](https://github.com/instana/nodejs/commit/ea4f59f37a57e2fc88855bc89ac47775dd1048b4))





# [2.13.0](https://github.com/instana/nodejs/compare/v2.12.0...v2.13.0) (2022-12-07)


### Bug Fixes

* **collector:** improved capturing object logging via bunyan ([#664](https://github.com/instana/nodejs/issues/664)) ([d0f16d1](https://github.com/instana/nodejs/commit/d0f16d136eaa5695fdf4128314a9c34a03e2a50b))





# [2.12.0](https://github.com/instana/nodejs/compare/v2.11.1...v2.12.0) (2022-11-22)

**Note:** Version bump only for package @instana/core





## [2.11.1](https://github.com/instana/nodejs/compare/v2.11.0...v2.11.1) (2022-11-09)


### Bug Fixes

* **sdk:** work around memory leak with recursive SDK usage ([c9b35eb](https://github.com/instana/nodejs/commit/c9b35eb37f1e41f7b11442dd408ca53f5cb2ac13))





# [2.11.0](https://github.com/instana/nodejs/compare/v2.10.0...v2.11.0) (2022-11-04)


### Features

* **tracing:** instrument prisma (ORM) ([ec760f7](https://github.com/instana/nodejs/commit/ec760f7af0abaa0946276fb2ff09aa0398ab761b))





# [2.10.0](https://github.com/instana/nodejs/compare/v2.9.0...v2.10.0) (2022-10-06)


### Features

* **collector:** added support for redis v4 ([#627](https://github.com/instana/nodejs/issues/627)) ([ad00255](https://github.com/instana/nodejs/commit/ad00255c73bc7ec080a1a91172a8878febe274b2))
* **kafka:** use kafka header format 'both' by default ([b2585cf](https://github.com/instana/nodejs/commit/b2585cf7e4c6f31b38d486505699309cb9d759d6))





# [2.9.0](https://github.com/instana/nodejs/compare/v2.8.1...v2.9.0) (2022-09-26)

**Note:** Version bump only for package @instana/core





## [2.8.1](https://github.com/instana/nodejs/compare/v2.8.0...v2.8.1) (2022-09-21)


### Bug Fixes

* **redis:** suppress error for unsupported redis@4 ([ffad2c2](https://github.com/instana/nodejs/commit/ffad2c2f09ae3672d158bb141c98c38c82a59139))





# [2.8.0](https://github.com/instana/nodejs/compare/v2.7.1...v2.8.0) (2022-09-20)


### Bug Fixes

* **db2:** redact password also from the end of the connection string ([ac4c46d](https://github.com/instana/nodejs/commit/ac4c46db11298dcdcc12017e4543972a93263f84)), closes [#614](https://github.com/instana/nodejs/issues/614)


### Features

* **dynamodb:** capture region as annotation ([4ba64f4](https://github.com/instana/nodejs/commit/4ba64f4d8155b365c0fd4540c1abdbe15b572fb5))





## [2.7.1](https://github.com/instana/nodejs/compare/v2.7.0...v2.7.1) (2022-09-05)


### Bug Fixes

* **sqs, sns:** do not add message attributes if that would violate limit ([23c8ca1](https://github.com/instana/nodejs/commit/23c8ca15f82d2e9ea917d710311f6261bbbd6a53))





# 2.7.0 (2022-08-31)


### Features

* **aws-lambda:** added support for arm64 architecture ([#605](https://github.com/instana/nodejs/issues/605)) ([03dd47a](https://github.com/instana/nodejs/commit/03dd47a76d894310ce93063f4e26fd1e667be655)), closes [#596](https://github.com/instana/nodejs/issues/596)





## 2.6.2 (2022-08-17)

**Note:** Version bump only for package @instana/core





## [2.6.1](https://github.com/instana/nodejs/compare/v2.6.0...v2.6.1) (2022-08-09)

**Note:** Version bump only for package @instana/core





# [2.6.0](https://github.com/instana/nodejs/compare/v2.5.0...v2.6.0) (2022-06-28)

**Note:** Version bump only for package @instana/core





# [2.5.0](https://github.com/instana/nodejs/compare/v2.4.0...v2.5.0) (2022-06-23)


### Features

* **core:** added ability to complete specific intermediate spans ([#564](https://github.com/instana/nodejs/issues/564)) ([480ee46](https://github.com/instana/nodejs/commit/480ee4693e91bbcfd11824f42dff31ca7898cba3)), closes [#561](https://github.com/instana/nodejs/issues/561)
* **sdk:** add methods to set the EUM correlation ID/type on the span ([727916c](https://github.com/instana/nodejs/commit/727916c7398219c292faad6e374d57a3838472d2))





# [2.4.0](https://github.com/instana/nodejs/compare/v2.3.0...v2.4.0) (2022-05-25)


### Features

* added node 18 support ([#529](https://github.com/instana/nodejs/issues/529)) ([b355a7c](https://github.com/instana/nodejs/commit/b355a7ca225bf9a06841619aae64bdefa1c0957a))





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
