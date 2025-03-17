# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.36.2-beta.0](https://github.com/instana/nodejs/compare/v2.36.1...v2.36.2-beta.0) (2025-02-20)


### Bug Fixes

* resolved logging issue for the  dependency distance calculator ([3d1816e](https://github.com/instana/nodejs/commit/3d1816e95de11ea41e0482af7abed6ed1c1adf53)), closes [#1019](https://github.com/instana/nodejs/issues/1019)
* resolved TypeError "eventLoopStats.sense is not a function" ([#1575](https://github.com/instana/nodejs/issues/1575)) ([65b8ee7](https://github.com/instana/nodejs/commit/65b8ee72caf90f6c3103c17e1ee00b3c7d118cb3))





## [2.36.1](https://github.com/instana/nodejs/compare/v2.36.0...v2.36.1) (2023-12-04)


### Bug Fixes

* **fetch:** fix header handling for Node.js >= 18.19.0 and >= 21.1.0 ([6420063](https://github.com/instana/nodejs/commit/6420063932c15b44a4aa436ec522dab4c03cca54))





# [2.36.0](https://github.com/instana/nodejs/compare/v2.35.0...v2.36.0) (2023-11-29)


### Bug Fixes

* **fetch:** fix header handling for native fetch for Node.js >= 20.10.0 ([ece1a9a](https://github.com/instana/nodejs/commit/ece1a9a0ba346cd12ad060b2f0827979f03dcb95))
* added missing prebuild for gcstats Node v20 ([#938](https://github.com/instana/nodejs/issues/938)) ([1b371a2](https://github.com/instana/nodejs/commit/1b371a2305660194ca2dbef49bc631121c1aa01b))
* **fetch:** fix trace correlation for native fetch for Node.js >= 20.8.1 ([e834c30](https://github.com/instana/nodejs/commit/e834c30ca552580e7d35041bfd99407035c5eee1))


### Features

* **sqs-consumer:** added v7 support for sqs-consumer ([#941](https://github.com/instana/nodejs/issues/941)) ([5394726](https://github.com/instana/nodejs/commit/539472675daaecc4d944da01d56e8253a773251e))





# [2.35.0](https://github.com/instana/nodejs/compare/v2.34.1...v2.35.0) (2023-11-14)


### Bug Fixes

* **couchbase:** added missing bucket type and name for bucket.query ([#922](https://github.com/instana/nodejs/issues/922)) ([fc2a9c0](https://github.com/instana/nodejs/commit/fc2a9c0e6b71e23a2106eb1de11d55a049a8ed9e))
* adds version information for all NPM packages ([#906](https://github.com/instana/nodejs/issues/906)) ([3301aff](https://github.com/instana/nodejs/commit/3301aff98e4bdcbc2230912d7778836393ae6433))


### Features

* **fastify:** added support for fastify v4 ([#920](https://github.com/instana/nodejs/issues/920)) ([fb22cb7](https://github.com/instana/nodejs/commit/fb22cb701579ba13271e42069f4a5dd860b42a79))
* **google cloud storage:** added support for google cloud storage v7 ([#913](https://github.com/instana/nodejs/issues/913)) ([33be8da](https://github.com/instana/nodejs/commit/33be8da7f327bb15c96594b44e01b6b9ed0eefdc))





## [2.34.1](https://github.com/instana/nodejs/compare/v2.34.0...v2.34.1) (2023-10-23)


### Bug Fixes

* **rdkafka:** only log warning about header format once ([#897](https://github.com/instana/nodejs/issues/897)) ([d8bf0ce](https://github.com/instana/nodejs/commit/d8bf0ce377115eeaa6c186f6447072a06f45055a))
* reduced log warnings when there is no entry span ([#891](https://github.com/instana/nodejs/issues/891)) ([8543808](https://github.com/instana/nodejs/commit/854380826eb7f67f93009fed1ed79bccc7d69508)), closes [#885](https://github.com/instana/nodejs/issues/885)





# [2.34.0](https://github.com/instana/nodejs/compare/v2.33.1...v2.34.0) (2023-10-10)


### Features

* added esm support for google cloud platform ([#859](https://github.com/instana/nodejs/issues/859)) ([55fd6ff](https://github.com/instana/nodejs/commit/55fd6ff93373d8c8f169fc7360b0c8285a64002a))
* added support for aws sdk v3 lambda ([#871](https://github.com/instana/nodejs/issues/871)) ([eb85c91](https://github.com/instana/nodejs/commit/eb85c91228144084191d12589f3b1152f6e2529d))


### Reverts

* Revert "chore: migrated to npm workspaces and lerna v7 (#876)" ([763ac7e](https://github.com/instana/nodejs/commit/763ac7e69d56742009e18964d267313918813c80)), closes [#876](https://github.com/instana/nodejs/issues/876)
* Revert "chore: fixed lock file" ([ec79043](https://github.com/instana/nodejs/commit/ec79043de6d9c94c0c3983ad9e9b765364abf8e2))





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


### Features

* **aws-lambda:** added support for missing regions ([#832](https://github.com/instana/nodejs/issues/832)) ([4d9904d](https://github.com/instana/nodejs/commit/4d9904dbb78dce4521bb604c3219844f1b55f147))





# [2.27.0](https://github.com/instana/nodejs/compare/v2.26.3...v2.27.0) (2023-07-24)


### Bug Fixes

* stack.slice not a function ([#828](https://github.com/instana/nodejs/issues/828)) ([827a722](https://github.com/instana/nodejs/commit/827a722939785ca70791e5c36de8a88a8c48423a))


### Features

* **aws-lambda:** added function url support ([6f9fdb2](https://github.com/instana/nodejs/commit/6f9fdb20640d986c7af58a6a6d77f385336a8cb2))





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


### Features

* added support for Node v20 (ESM not working yet) ([#805](https://github.com/instana/nodejs/issues/805)) ([830259f](https://github.com/instana/nodejs/commit/830259f1267e0e2f77208f607fdb15a8d520953e))





## [2.25.3](https://github.com/instana/nodejs/compare/v2.25.2...v2.25.3) (2023-06-27)


### Dependencies

* **deps:** bump semver from 7.3.3 to 7.5.3 ([f6d2a0b](https://github.com/instana/nodejs/commit/f6d2a0bda2d02c5c6baf31a8695e3b0c545be3b6))





## [2.25.2](https://github.com/instana/nodejs/compare/v2.25.1...v2.25.2) (2023-06-22)


### Bug Fixes

* **sdk:** do not overwrite span.ec after it has been set via the SDK ([4283cdf](https://github.com/instana/nodejs/commit/4283cdf962505d5471d3b849137f36a7134ae740))





## [2.25.1](https://github.com/instana/nodejs/compare/v2.25.0...v2.25.1) (2023-06-19)


### Bug Fixes

* **lambda:** avoid freezing outgoing requests ([#806](https://github.com/instana/nodejs/issues/806)) ([0e32399](https://github.com/instana/nodejs/commit/0e3239987dbc487050e8ff28168ad570af4e08a0))





# [2.25.0](https://github.com/instana/nodejs/compare/v2.24.0...v2.25.0) (2023-06-16)


### Features

* **sdk:** add method to mark the current span as erroneous ([2cfcc7b](https://github.com/instana/nodejs/commit/2cfcc7b921518b4dc174b8296cff0122f523d532))





# [2.24.0](https://github.com/instana/nodejs/compare/v2.23.0...v2.24.0) (2023-06-13)


### Bug Fixes

* **announce:** verify connection to Instana host agent via payload check ([ae1b41c](https://github.com/instana/nodejs/commit/ae1b41c93392f8ad3a15ef3f809d2f5cfbfddbc8))


### Features

* **collector:** added node:fs, restify and socket.io support (OpenTelemetry integration) ([#715](https://github.com/instana/nodejs/issues/715)) ([60f3bb9](https://github.com/instana/nodejs/commit/60f3bb960f909e0640b372de97c8f6d7c1654038)), closes [#109122](https://github.com/instana/nodejs/issues/109122)





# [2.23.0](https://github.com/instana/nodejs/compare/v2.22.1...v2.23.0) (2023-06-06)


### Features

* **aws-lambda:** added support for payload version format 2.0 ([#786](https://github.com/instana/nodejs/issues/786)) ([06c9780](https://github.com/instana/nodejs/commit/06c9780346620cb28a1d6d7225ad092039374333)), closes [#34347](https://github.com/instana/nodejs/issues/34347)





## [2.22.1](https://github.com/instana/nodejs/compare/v2.22.0...v2.22.1) (2023-05-15)


### Bug Fixes

* **db2:** ensure span is correctly processed as an IBM DB2 span ([de3a8b4](https://github.com/instana/nodejs/commit/de3a8b4e2241fe089cb1938b6eb955057ec2b33e))
* **sqs:** fix missing async context in recent aws-sdk/client-sqs version ([6ae90e7](https://github.com/instana/nodejs/commit/6ae90e74fee5c47cc4ade67d21c4885d34c08847))





# [2.22.0](https://github.com/instana/nodejs/compare/v2.21.1...v2.22.0) (2023-05-09)


### Bug Fixes

* **announce:** remove obsolete check for Server header ([7d6a05b](https://github.com/instana/nodejs/commit/7d6a05bc24e3b85df4bfee831f0a6e495ae7dedd))
* **collector:** keep EOL events open instead of recreating them ([6de9965](https://github.com/instana/nodejs/commit/6de9965c5fb667027a3b84fbd15aec3f591f32d5))


### Features

* **mongodb:** add support for mongodb v4, v5 & mongoose v6 & v7 ([4e80a26](https://github.com/instana/nodejs/commit/4e80a2680d3a438280aefa1ab8623e36ca17c290))
* **w3c:** support W3C trace context level 2 ([62e0f99](https://github.com/instana/nodejs/commit/62e0f99710fe3299f6c9825358221f5d065be50d))





## [2.21.1](https://github.com/instana/nodejs/compare/v2.21.0...v2.21.1) (2023-05-02)


### Bug Fixes

* **announce:** fix timeout for host agent lookup ([d4e440f](https://github.com/instana/nodejs/commit/d4e440fd91ce8a8d14e5ce90e819a7259a7c9442))
* **db2:** capture the correct destination dsn per client ([9529690](https://github.com/instana/nodejs/commit/9529690070871fddd2d31b0b646badc320dde56b))
* **elasticsearch:** capture the correct destination host per client ([cc23d05](https://github.com/instana/nodejs/commit/cc23d057a9d60a3a179e20451e0bc336e3c9a56d))
* **nats:** capture the correct destination nats address per client ([59e5ddf](https://github.com/instana/nodejs/commit/59e5ddfbbe85a724bfc040e140e63bf906706f2f))
* **nats-streaming:** capture correct destination address per client ([678d702](https://github.com/instana/nodejs/commit/678d70276dcb761eeb64dc3c848157267458192c))





# [2.21.0](https://github.com/instana/nodejs/compare/v2.20.2...v2.21.0) (2023-04-21)


### Features

* **collector:** added support for couchbase ([#737](https://github.com/instana/nodejs/issues/737)) ([3239b19](https://github.com/instana/nodejs/commit/3239b196eb54d7ea1e399ba2a9701024865da1c5))
* **opentelemetry-exporter:** added support for INSTANA_DEBUG env variable ([#759](https://github.com/instana/nodejs/issues/759)) ([4e922c2](https://github.com/instana/nodejs/commit/4e922c2c39fddb4b605375c9fac71bd3ae497341))





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

* **aws-lambda:** add support for Node.js 18 AWS Lambda runtime ([0900ab4](https://github.com/instana/nodejs/commit/0900ab4e040822d17a2af6610fe7623846fd6128))
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


### Bug Fixes

* **aws-lambda:** respect INSTANA_LOG_LEVEL ([#681](https://github.com/instana/nodejs/issues/681)) ([8c00a0c](https://github.com/instana/nodejs/commit/8c00a0cf905d0c21fb56d10496087a8a07599b51))





## [2.14.1](https://github.com/instana/nodejs/compare/v2.14.0...v2.14.1) (2023-01-12)


### Bug Fixes

* **collector:** fixed package.json not being found when app is ESM ([#678](https://github.com/instana/nodejs/issues/678)) ([0dbd0a2](https://github.com/instana/nodejs/commit/0dbd0a223344dabc49c559ba92e383b2356d5323))
* **collector:** mysql2/promise not working with ESM ([f059047](https://github.com/instana/nodejs/commit/f059047d8be41230a9bf5ec9fb320a58c055c630))





# [2.14.0](https://github.com/instana/nodejs/compare/v2.13.2...v2.14.0) (2023-01-02)


### Features

* **collector:** tracing all spans when client app is using ES modules ([#672](https://github.com/instana/nodejs/issues/672)) ([7d471ff](https://github.com/instana/nodejs/commit/7d471ff751fbd29ce1c96a752304ec3399d0c78c))





## [2.13.2](https://github.com/instana/nodejs/compare/v2.13.1...v2.13.2) (2022-12-14)


### Bug Fixes

* **aws-fargate:** cannot read property 'cpu' of undefined ([#671](https://github.com/instana/nodejs/issues/671)) ([bea107c](https://github.com/instana/nodejs/commit/bea107c84191111302dc91e164a7b68d29731d07))
* **aws-lambda:** reduced deadlocks and long running lambda executions ([#666](https://github.com/instana/nodejs/issues/666)) ([6800be0](https://github.com/instana/nodejs/commit/6800be01d32989723799894dd75a834f2c6c3f30))





## [2.13.1](https://github.com/instana/nodejs/compare/v2.13.0...v2.13.1) (2022-12-12)


### Bug Fixes

* **collector:** resolved elasticsearch legacy error ([ea4f59f](https://github.com/instana/nodejs/commit/ea4f59f37a57e2fc88855bc89ac47775dd1048b4))





# [2.13.0](https://github.com/instana/nodejs/compare/v2.12.0...v2.13.0) (2022-12-07)


### Bug Fixes

* **collector:** improved capturing object logging via bunyan ([#664](https://github.com/instana/nodejs/issues/664)) ([d0f16d1](https://github.com/instana/nodejs/commit/d0f16d136eaa5695fdf4128314a9c34a03e2a50b))


### Features

* **aws-lambda:** added the RequestId to most of the extension logs ([#660](https://github.com/instana/nodejs/issues/660)) ([469f131](https://github.com/instana/nodejs/commit/469f13195350d8e49952b9d7cec35ba71aaec428))





# [2.12.0](https://github.com/instana/nodejs/compare/v2.11.1...v2.12.0) (2022-11-22)


### Features

* **aws-lambda:** added support for ES modules ([#653](https://github.com/instana/nodejs/issues/653)) ([75c28a9](https://github.com/instana/nodejs/commit/75c28a92fb68f3d982207b545a211b65dc4d95ce))





## [2.11.1](https://github.com/instana/nodejs/compare/v2.11.0...v2.11.1) (2022-11-09)


### Bug Fixes

* **sdk:** work around memory leak with recursive SDK usage ([c9b35eb](https://github.com/instana/nodejs/commit/c9b35eb37f1e41f7b11442dd408ca53f5cb2ac13))





# [2.11.0](https://github.com/instana/nodejs/compare/v2.10.0...v2.11.0) (2022-11-04)


### Bug Fixes

* **serverless:** do not send x-instana-time header ([7ce7673](https://github.com/instana/nodejs/commit/7ce7673a514069b47c5b883faa9d86bc240244b6))


### Features

* **tracing:** instrument prisma (ORM) ([ec760f7](https://github.com/instana/nodejs/commit/ec760f7af0abaa0946276fb2ff09aa0398ab761b))





# [2.10.0](https://github.com/instana/nodejs/compare/v2.9.0...v2.10.0) (2022-10-06)


### Features

* **collector:** added support for redis v4 ([#627](https://github.com/instana/nodejs/issues/627)) ([ad00255](https://github.com/instana/nodejs/commit/ad00255c73bc7ec080a1a91172a8878febe274b2))
* **kafka:** use kafka header format 'both' by default ([b2585cf](https://github.com/instana/nodejs/commit/b2585cf7e4c6f31b38d486505699309cb9d759d6))


### Reverts

* Revert "build(deps-dev): bump mssql from 7.3.1 to 9.0.1" (#632) ([309e17b](https://github.com/instana/nodejs/commit/309e17b390a4a32f8f1eb80102a1babae881ec50)), closes [#632](https://github.com/instana/nodejs/issues/632)





# [2.9.0](https://github.com/instana/nodejs/compare/v2.8.1...v2.9.0) (2022-09-26)


### Features

* **aws-lambda:** added heartbeat to reduce timeouts ([#612](https://github.com/instana/nodejs/issues/612)) ([79ec77f](https://github.com/instana/nodejs/commit/79ec77f41e13688a3347a6a88a6d87839212cabd))





## [2.8.1](https://github.com/instana/nodejs/compare/v2.8.0...v2.8.1) (2022-09-21)


### Bug Fixes

* **redis:** suppress error for unsupported redis@4 ([ffad2c2](https://github.com/instana/nodejs/commit/ffad2c2f09ae3672d158bb141c98c38c82a59139))





# [2.8.0](https://github.com/instana/nodejs/compare/v2.7.1...v2.8.0) (2022-09-20)


### Bug Fixes

* **aws-lambda:** reduced backend retries & timeout ([#611](https://github.com/instana/nodejs/issues/611)) ([cab67dd](https://github.com/instana/nodejs/commit/cab67dd10b0f0b7ccfce2787b95e5a020d831cff))
* **db2:** redact password also from the end of the connection string ([ac4c46d](https://github.com/instana/nodejs/commit/ac4c46db11298dcdcc12017e4543972a93263f84)), closes [#614](https://github.com/instana/nodejs/issues/614)


### Features

* **dynamodb:** capture region as annotation ([4ba64f4](https://github.com/instana/nodejs/commit/4ba64f4d8155b365c0fd4540c1abdbe15b572fb5))





## [2.7.1](https://github.com/instana/nodejs/compare/v2.7.0...v2.7.1) (2022-09-05)


### Bug Fixes

* **sqs, sns:** do not add message attributes if that would violate limit ([23c8ca1](https://github.com/instana/nodejs/commit/23c8ca15f82d2e9ea917d710311f6261bbbd6a53))





# [2.7.0](https://github.com/instana/nodejs/compare/v2.6.2...v2.7.0) (2022-08-31)


### Features

* **aws-lambda:** added support for arm64 architecture ([#605](https://github.com/instana/nodejs/issues/605)) ([03dd47a](https://github.com/instana/nodejs/commit/03dd47a76d894310ce93063f4e26fd1e667be655)), closes [#596](https://github.com/instana/nodejs/issues/596)
* **aws-lambda:** send preflight request to the AWS Lambda extension 



### Bug Fixes


* **lambda:** work around req.destroyed not being set in Node.js <= 12 
* **lambda:** fix concurrency bug in preflight request handling 
* **tracing:** fix log4js message format call 




## [2.6.2](https://github.com/instana/nodejs/compare/v2.6.1...v2.6.2) (2022-08-17)

**Note:** Version bump only for package @instana/root





## [2.6.1](https://github.com/instana/nodejs/compare/v2.6.0...v2.6.1) (2022-08-09)


### Bug Fixes

* **lambda:** increase socket and HTTP timeout for Lambda extension ([7a07a8b](https://github.com/instana/nodejs/commit/7a07a8b1f596cf611bb8a144316b1432a688e1eb))
* **lambda:** interprete deadlineMs as absolute timestamp ([3326e67](https://github.com/instana/nodejs/commit/3326e6768aa962d7514eed314dd1c0a66612e69f))





# [2.6.0](https://github.com/instana/nodejs/compare/v2.5.0...v2.6.0) (2022-06-28)


### Features

* **aws-lambda:** added support for Node v16 ([718cf9f](https://github.com/instana/nodejs/commit/718cf9f69de3062964a28390900dc3f158557cdf))





# [2.5.0](https://github.com/instana/nodejs/compare/v2.4.0...v2.5.0) (2022-06-23)


### Bug Fixes

* **aws-lambda:** handle timeout error handling better ([#563](https://github.com/instana/nodejs/issues/563)) ([c2dbe77](https://github.com/instana/nodejs/commit/c2dbe7761f62b3c4b7c0cd9ba5cc0d5757d161c1))


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

* **agent:** read span batching option also from tracing section ([1f776d4](https://github.com/instana/nodejs/commit/1f776d46d6329f33939d65041fdc7a78246d62ea))
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

* **fargate:** detect Node.js version, use matching @instana/aws-fargate version ([0d1f955](https://github.com/instana/nodejs/commit/0d1f9557d650aad45673c2caaa22b8906b9b29d3))
* **google-cloud-run:** detect Node.js version, use matching @instana/google-cloud-run version ([451ad1f](https://github.com/instana/nodejs/commit/451ad1f173bff3298ee1250dd2477316ff05adcc))
* **lambda:** remove nodejs8.10 from compatible runtimes ([ff945c2](https://github.com/instana/nodejs/commit/ff945c228e5361227bdae50ff48cc96b64c6b08c))
* dropped Node 6/8 ([0e6fd0e](https://github.com/instana/nodejs/commit/0e6fd0ef8f836ef6f2d95f3ddda2a641d92d0f86))
* remove npm package instana-nodejs-sensor ([5fb9f18](https://github.com/instana/nodejs/commit/5fb9f1807998fb3335652d135eb167dc13f9221d))
* removed disableAutomaticTracing legacy config ([#432](https://github.com/instana/nodejs/issues/432)) ([922d168](https://github.com/instana/nodejs/commit/922d168855000f108d23daeb4e267037098ccc1f))
* removed legacy support for config.timeBetweenHealthcheckCalls ([#476](https://github.com/instana/nodejs/issues/476)) ([66eff69](https://github.com/instana/nodejs/commit/66eff6905f0fa4e55987c931345df88eb9fcf114))
* removed support for passing parent logger during initialisation ([bd96791](https://github.com/instana/nodejs/commit/bd9679151388cd8c865df8910b35f7f00e1ca6de))
* removed uncaught exception config ([fb6570a](https://github.com/instana/nodejs/commit/fb6570a862dbdec776eb78b840dcdc4184cd5f00))
* self-disable if detected Node.js runtime version is too old ([cfe4248](https://github.com/instana/nodejs/commit/cfe4248a9a107165f8e96dbcb1948b399527d244))


### BREAKING CHANGES

* **lambda:** The Instana Node.js Lambda layer is no longer compatible with
Node.js 8. For Lambda functions still running on Node.js 8, please use the
latest layer version that has been published for Node.js 8, see
https://www.ibm.com/docs/en/obi/current?topic=kinesis-aws-lambda-native-tracing-nodejs
* Removed support for legacy config `instana({ timeBetweenHealthcheckCalls: ... })`.
                 Use `instana({ metrics: { timeBetweenHealthcheckCalls: ...}})`.
* Starting with version 2.0.0, consumers of the package who
still use the deprecated package name instana-nodejs-sensor will need to follow
https://www.ibm.com/docs/en/obi/current?topic=nodejs-collector-installation#change-of-package-name
to receive updates in the future.
* Removed "disableAutomaticTracing" config option.
                 Use `instana({ automaticTracingEnabled: Boolean })`.
* Removed "reportUncaughtException" config option.
	 	 The feature was completely removed.
* Removed support for passing logger to instana initialisation.
	 	 Use `instana.setLogger(logger)`".
* v2 has dropped support for Node 6/8.





## [1.140.1](https://github.com/instana/nodejs/compare/v1.140.0...v1.140.1) (2022-04-04)


### Bug Fixes

* **metrics:** do not report metrics from worker threads ([#517](https://github.com/instana/nodejs/issues/517)) ([bdf7869](https://github.com/instana/nodejs/commit/bdf7869e08d039e5769131d958e1037dc1748cd1)), closes [#500](https://github.com/instana/nodejs/issues/500)





# [1.140.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.140.0) (2022-03-24)


### Bug Fixes

* **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))
* **collector:** work around Bazel's node-patches module ([d06e9be](https://github.com/instana/nodejs/commit/d06e9be187e9f97c43e4a129ebb2f5e18f82ef8c))


### Features

* **collector:** added instrumentation for @grpc/grpc-js ([d12e386](https://github.com/instana/nodejs/commit/d12e386e95ced2c68d2d549dff83ea3ecfe51735)), closes [#87653](https://github.com/instana/nodejs/issues/87653)
* **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))


### Reverts

* Revert "test: added tsoa framework to integration tests (#492)" ([479a3f6](https://github.com/instana/nodejs/commit/479a3f60f34c87828d2db1d515723f2aa9b076f7)), closes [#492](https://github.com/instana/nodejs/issues/492)





# [1.139.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.139.0) (2022-03-09)


### Bug Fixes

* **collector:** fix export returned from init ([3cc709c](https://github.com/instana/nodejs/commit/3cc709cccb37ac9b0135a604e33f030a63b6cbda))


### Features

* **tracing:** added instrumentation for node-rdfafka/kafka-avro ([7cb7aa4](https://github.com/instana/nodejs/commit/7cb7aa4207e9807de3c826eeac5369bc39a16ffa))





# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)


### Bug Fixes

* **tracing:** fix version constraint for http2 instrumentation ([50f380f](https://github.com/instana/nodejs/commit/50f380f82bb877529daec51fbb16226a8b434751)), closes [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8) [/github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md#8](https://github.com//github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V8.md/issues/8)


### Features

* **aws-lambda:** added support for SSM parameter store ([#464](https://github.com/instana/nodejs/issues/464)) ([bdb6e68](https://github.com/instana/nodejs/commit/bdb6e68b821e45445752d351e3575c6b0d7f1da7))





## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)


### Bug Fixes

* **deps:** bumped node-fetch to ^2.6.7 (security patch) ([#465](https://github.com/instana/nodejs/issues/465)) ([e8c622b](https://github.com/instana/nodejs/commit/e8c622bd976f9b552572cfed927cb11876315979))





## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)


### Bug Fixes

* **aws-lambda:** fixed lambda timeouts when using extension ([#455](https://github.com/instana/nodejs/issues/455)) ([6df5550](https://github.com/instana/nodejs/commit/6df5550e59ab667a1eda5a01d911554e3dc17aee))
* **aws-lambda:** reduced lambda timeout error count when using extension [#443](https://github.com/instana/nodejs/issues/443) ([0bbfeb8](https://github.com/instana/nodejs/commit/0bbfeb8af57a381c5186624cbf5a19ead11ffe61))
* **clean aws:** fixed S3 cleanup when buckets have no objects [skip ci] ([cc3af62](https://github.com/instana/nodejs/commit/cc3af6237e9c94d35f656b31978fabaf2ba71185))
* **tracing:** fix vendoring of emitter-listener for legacy cls context ([440fd32](https://github.com/instana/nodejs/commit/440fd3218a37bc333da26c2365bfc1116a931b9b))





## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)


### Bug Fixes

* **aws-sdk/v3:** added support for @aws-sdk/* 3.4x ([61cc179](https://github.com/instana/nodejs/commit/61cc17945279f4f0996f87e2d955fc4daf519d24))
* **tracing:** fix context loss when cls-hooked#bindEmitter is used ([2743047](https://github.com/instana/nodejs/commit/2743047b79533f5d54233e23ecfce40635bc9981)), closes [#438](https://github.com/instana/nodejs/issues/438)





## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)


### Bug Fixes

* **collector:** prevent initializing @instana/collector multiple times ([b3261b7](https://github.com/instana/nodejs/commit/b3261b7a653b406cbe2eeaaf9050134bbeedfac9))
* **tracing:** require @elastic/elasticsearch/api in a safe way ([8ba1bd1](https://github.com/instana/nodejs/commit/8ba1bd1d6fb082a9ec131ff15e8df17c7b18e116))





## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)


### Bug Fixes

* **dependency:** pinned lru-cache to 6.0.0 ([0ceb372](https://github.com/instana/nodejs/commit/0ceb372709bd53d0c6cab2060d8cdaf431133706))
* **dependency:** pinned semver to 7.3.3 ([d32f23e](https://github.com/instana/nodejs/commit/d32f23ea6807989d57ec6165c407b64e04d8d7c1))
* **dependency:** updated tar to 6.x in shared-metrics ([#415](https://github.com/instana/nodejs/issues/415)) ([5288ba5](https://github.com/instana/nodejs/commit/5288ba5241acd23d54f11c76edb3cffc0ffe6a66))





## 1.137.0
- Configurable Kafka trace correlation (enabled/disabled) and correlation header format (string, binary, both).
- [AWS Lambda] Add DynamoDB streams trigger.
- [W3C Trace Context] Reject traceparent header when either trace ID or parent span ID are all zeroes.
- [Bull] Fixed the error `TypeError: Cannot read property 'opts' of null` in repeatable jobs.

## 1.136.0
- An issue event is sent if the application uses an EOL (end of life) version of Node.js. Applicable only for non serverless environments.
- Manual spans creation handles tags that are passed as non extensible objects - when `Object.freeze` or `Object.preventExtensions` is applied to the tags.
- [AWS SDKv2] Instrumentation of SNS
- Remove dependency to node-gyp. This also removes the opt-in feature of rebuilding native add-ons via node-gyp. This capability was off by default in previous releases, it could be enabled via `INSTANA_REBUILD_NATIVE_ADDONS_ON_DEMAND=true`. This is no longer available, the environment variable will be ignored now.
- Fix: Capture HTTP status codes for GraphQL requests over HTTP.

## 1.135.0
- [Fastify] Add support for 2.x and 3.x

## 1.134.0
- [OpenTelemetry] Add new package `@instana/opentelemetry-exporter` that offers an Instana exporter for OpenTelemetry spans

## 1.133.0
- [AWS Lambda] Increase retries and timeout in Lambda extension binary.
- Add console.warn & console.error instrumentation

## 1.132.2
- Fix `path must be a string of Buffer` error in dependency distance calculator.
- Fix: Use different attribute names in vendored version of `emitter-listener`, to avoid conflicts if the unfixed `emitter-listener` package is still installed and being used by other packages.

## 1.132.1
- Fix: Rename global attribute from cls-hooked from process.namespaces to process.instanaNamespaces to avoid conflicts with other usages of cls-hooked.
- Fix: Vendor the fixed version of `emitter-listener`, so that wrapping the same emitter multiple times works correctly.

## 1.132.0
- Fix instrumentation for very old versions of `redis` (0.12.1).
- AWS SDK v3: Instrumentation of SQS

## 1.131.0
- Limit the number of depdendencies collected as snapshot data.

## 1.130.1
- Update dependency [`tar`](https://www.npmjs.com/package/tar) ([#367](https://github.com/instana/nodejs/pull/367), thanks to @gebhardtr).

## 1.130.0
- [AWS Lambda] Add W3C trace context support for Lambda tracing.

## 1.129.0
- Bring back `applicationUnderMonitoring#getMainPackageJson` and `applicationUnderMonitoring#getMainPackageJsonPath` for backward compatibility.
- AWS SDK v3: Instrumentation of S3

## 1.128.0
- [AWS Lambda] Add trace correlation support for Lambda invocations triggered by SQS messages (including SNS-to-SQS).
- Add trace continuity support for SNS-to-SQS bridge for SQS tracing.

## 1.127.0
- AWS SDK v3: Instrumentation of DynamoDB

## 1.126.2
- Fix: AWS SQS headers reading properly checks for strings, numbers and arrays of strings

## 1.126.1
- The repository was renamed to https://github.com/instana/nodejs (previously: https://github.com/instana/nodejs-sensor).
- Memcached: added `connection` property

## 1.126.0
- Instrumentation of memcached

## 1.125.1
- Reporting correct SQS entry span duration
- Reporting SQS-Consumer processing error messages to the agent

## 1.125.0
- Redact embedded credentials from captured URLs (that is, remove the user:password part from URLs like http://user:password@example.org).
- Add Node.js 16 to the test matrix.

## 1.124.0
- [AWS Lambda] Detect Lambda cold starts.
- [AWS Lambda] Detect imminent Lambda timeouts heuristically.
- Instrumentation of AWS Lambda invoke function

## 1.121.0
- [AWS Lambda] Include Instana's [AWS Lambda extension](https://docs.aws.amazon.com/lambda/latest/dg/using-extensions.html) in the [Instana Node.js Lambda layer](https://www.ibm.com/docs/de/obi/current?topic=kinesis-aws-lambda-native-tracing-nodejs#instana-autotrace-setup). Monitoring data and traces are offloaded locally to Instana's Lambda extension, which will then forward it to the Instana back end. This feature is currently limited to Lambda functions configured with 256 MB of memory or more. Using the Instana Lambda extension can be disabled by setting the environment variable `INSTANA_DISABLE_LAMBDA_EXTENSION` to a non-empty string for a Lambda function.

## 1.120.0
- Add instrumentation for AWS Kinesis

## 1.119.5
- Let instrumented GRPC `ServiceClient` inherit from base client, fixes an issue with [`mali`](https://www.npmjs.com/package/mali) up to version `0.20.0`.
- AWS SQS: remove duplicated instrumentation of receiveMessage in `sqs-consumer` instrumentation.

## 1.119.4
- Fix handling of null/undefined values used as exceptions/reasonswhen reporting uncaught exceptions and unhandled promise rejections.

## 1.119.3
- Instrument `sqs-consumer` to capture exit child spans of SQS entries correctly.
- Add additional check in instrumentation for `@elastic/elasticsearch` to fix TypeError when no action is present.

## 1.119.2
- [AWS Fargate]: Fix secrets filtering for environment variables.
- [Google Cloud Run]: Fix secrets filtering for environment variables.

## 1.119.1
- Fixed a call from collector to the core by using @instana/collector instead of relative path

## 1.119.0
- Add instrumentation for Bull Messaging Framework.

## 1.118.0
- Update third party dependencies.

## 1.117.3
- Fix garbage collection metrics being reported falsely as not supported when `node_modules/gcstats.js` exists.

## 1.117.2
- Do not assume type local by default for OpenTracing spans. Instead, assume type entry when no parent context is available and only assume local if a parent context is available.
- Update to shimmer@1.2.1.

## 1.117.1
- Fix: Do not attempt to load native addons in a worker thread.

## 1.117.0
- [AWS Lambda] Reduce execution time overhead for native AWS Lambda tracing even further. (Bring back performance optimzation that was removed in 1.94.0 with a fix for the stale timeout events.)

## 1.116.0
- Add instrumentation for AWS DynamoDB.

## 1.115.0
- Add instrumentation for AWS S3.
- Update handling of W3C trace context headers to improve integration with OpenTelemetry.
- [AWS Lambda] Fix timeouts when the Lambda callback API without `context.callbackWaitsForEmptyEventLoop = false` is used and the Instana back end responds too slowly.

## 1.114.0
- Introduction of AWS SQS instrumentation for sending and reading messages.
- fix: run original function in runInAsyncContext/runPromiseInAsyncContext when tracing is not active.

## 1.113.0
- Instrument MongoDB native driver unified topology.
- Add configuration mechanism to disable copying of precompiled add-ons (`INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS=false`).
- Make rebuilding native add-ons via node-gyp an opt-in feature (it is off by default now, use `INSTANA_REBUILD_NATIVE_ADDONS_ON_DEMAND=true` to enable it).

## 1.112.1
- Improve heuristic to detect npm or yarn.

## 1.112.0
- Remove `netlinkwrapper` dependency.
- Deprecate reporting uncaught exceptions as incidents and via span/trace. Prints a warning if the feature (which is opt-in) is enabled.

## 1.111.1:
- Avoid false positive warning about @instana/core being initialized too late in the presence of other instrumentation packages that need to be loaded before everything else.

## 1.111.0:
- Do not instrument npm or yarn when started via @instana/collector/src/immediate (instead, only instrument the child process started by npm start or yarn start).
- Do not instrument npm or yarn on AWS Fargate (instead, only instrument the child process started by npm start or yarn start).
- Do not instrument npm or yarn on Google Cloud Run (instead, only instrument the child process started by npm start or yarn start).

## 1.110.5:
- Depend on exact versions of `@instana` packages, not a version range. This makes sure all `@instana` packages are updated in sync and it avoids internal packages like `core` being updated while consuming packages like `collector` stay on an older version.

## 1.110.4
- Bring back core/util polyfill for Buffer.fromString for backwards compatibility.

## 1.110.3
- Exponential backoff retry strategy for failed announce attempts. This helps with agents that have not yet attached to the container (and thereby not seen the process) and thus will reject the very first announce attempt.
- Remove polyfill for Buffer.fromString (for Node.js versions up to 4.5 which we no longer support).

## 1.110.2
- Improve support for pino log calls that only receive a merging object argument.

## 1.110.1
- Fix Node.js 6 compatibility by downgrading `tar` dependency of `@instana/shared-metrics` from `tar@6` to `tar@5`.

## 1.110.0
- [Google Cloud Run]: Exclude some revision instance data from compression.

## 1.109.0
- Improve user experience around native add-on dependencies of `@instana/collector`:
    - Add precompiled archives for some combination of OS, architecture, libc-flavour and ABI-version.
    - Try to use the precompiled native add-on if loading a native add-on fails initially.
    - Try to rebuild the native add-on on demand as a fallback.

## 1.108.0
- Implement batching for very short (< 10 ms), high-frequency database spans (opt-in in this release, will be switched to default behaviour in one of the next releases). To enabled it right now, any of the three following methods can be used:
    - Set the environment variable `INSTANA_SPANBATCHING_ENABLED=true`.
    - Use in-code configuration: `config.tracing.spanBatchingEnabled: true`.
    - Add this to the agent's `configuration.yaml`:

      ```
      com.instana.plugin.nodejs:
        span-batching-enabled: true
      ```
- [AWS Lambda] Check type of Lambda error messages and stringify if necessary.

## 1.107.0
- Add instrumentation for [`@google-cloud/pubsub`](https://www.npmjs.com/package/@google-cloud/pubsub).

## 1.106.6
- Fix (Elasticsearch): Adapt instrumentation for `@elastic/elasticsearch` for refactoring of `api` submodule introduced in `@elastic/elasticsearch@7.9.1`. (Fixes `TypeError: Cannot set property 'Symbol(configuration error)' of undefined`.) Also, remove obsolete `stats` annotation for `elasticsearch` spans.
- Remove longer span reporting interval for serverless tracers, use standard interval instead.

## 1.106.5
- [Google Cloud Run]: Minor changes for the upcoming Google Cloud Run support. Requires at least Instana back end version 189.

## 1.106.4
- Remove direct `node-fetch` dependency from `@instana/aws-fargate` as well as `@instana/google-cloud-run` and move it to `@instana/metrics-util` instead.
- Optimization: Only set `span.data.service` on first span.
- Send `span.crid`/`span.crtp` instead of `span.data.correlationId`/`span.data.correlationType`.

## 1.106.3
- Fix: Move `event-loop-lag` from optionalDependencies to dependencies, so installations with `--ignore-optional` will work correctly. ([#258](https://github.com/instana/nodejs/pull/258), thanks to @ThisIsMissEm).
- [AWS Fargate]: Update dependency `node-fetch` version 2.6.1 (fixes https://www.npmjs.com/advisories/1556).

## 1.106.2
- [AWS Fargate]: Make optional dependencies on native add-ons truely optional (do not break the Docker build on `RUN /instana/setup.sh`).
- Fix: Propagate `X-INSTANA-L: 0` downstream with AMQP headers.

## 1.106.1
- Fix bogus warning about invalid configuration emitted during startup (`"Invalid configuration: config.tracing.http.extraHttpHeadersToCapture is not an array, the value will be ignored: {}"`).
- [Google Cloud Run]: *Experimental* in-process data collection for Google Cloud Run services via the new package `@instana/google-cloud-run`. Requires at least Instana back end version 185. `@instana/google-cloud-run` supports Node.js 8.6.0 or later. Note that this is an early technical preview and not ready for general usage. At this time, no support can be provided for this new package. This will change once Google Cloud Run support becomes generally available with Instana.

## 1.106.0
- Fix(HTTP1/Server): Also set Server-Timing header when X-INSTANA-T is incoming (that is, not only when we start a fresh trace).
- Fix(HTTP1/Server): Do not append another intid key-value pair to Server-Timing if it is already present.
- Fix(HTTP2/Server): Add support for website monitoring back end correlation via Server-Timing header.
- Fix(HTTP2/Server): Add support for X-Instana-Service.
- Fix(HTTP2/Server): Inject the trace ID into the request to enable application code to inject it into the response body.
- Fix(HTTP2/Server): Use case-insensitive header matching as incoming headers are already normalized to lower case (performance improvement).
- Add support for `INSTANA_EXTRA_HTTP_HEADERS` variable.
- Fix(HTTP1/HTTP2): Fix handling for headers of type array (normalize to string, separated by 0x2C 0x20).
- [AWS Fargate] Add support for `INSTANA_ZONE`.
- [AWS Fargate] Add support for `INSTANA_TAGS`.
- Secrets Filtering: Replace values for filtered query parameters with `<redacted>` instead of removing the whole key-value pair.
- [AWS Fargate] Add support for `INSTANA_SECRETS`.
- [AWS Fargate] Add support for `INSTANA_EXTRA_HTTP_HEADERS`.
- [AWS Lambda] Add support for `INSTANA_SECRETS`.
- [AWS Lambda] Make `INSTANA_EXTRA_HTTP_HEADERS` also apply to HTTP exits.
- [AWS Lambda] Improve handling for `event.multiValueHeaders`.

## 1.105.1
- Fall back to `process.mainModule.filename` as the Node.js app's name when the `package.json` file is not present.
- Capture dependencies of an app even if the `package.json` file is not present, by inspecting the `node_modules` folder that is closest to `process.mainModule` in the file system.

## 1.105.0
- Add instrumentation for the [Google Cloud Storage client](https://googleapis.dev/nodejs/storage/latest/index.html).

## 1.104.0
- Drop support for Node.js versions 4 (which was EOL 2018-04-30) and 5 (EOL 2016-06-30) in `@instana/collector`. If you want to use `@instana/collector` with Node.js version 4 or 5 please pin `@instana/collector` to version `1.103.0`.
- Fix: Capture MongoDB aggregate operations correctly.
- Fix: Keep async context across Mongoose custom thenables.

## 1.103.0
- Instrument Node.js core [http2 module](https://nodejs.org/api/http2.html) to trace HTTP/2 communication (except for server push/`pushStream`).

## 1.102.0
- Instrument [superagent's](https://www.npmjs.com/package/superagent) custom thenable to keep asynchronous context.
- Provide experimental API to instrument specific modules on demand for non-standard build/deployment scenarios (e.g. bundling dependencies).
- Fix captured protocol for https URLs in some HTTP exit spans.

## 1.101.1
- [AWS Fargate] Collect Docker metrics on platform version 1.4.0, too.

## 1.101.0
- [AWS Fargate] Collect and report Docker metrics.

## 1.100.2
- Fix: Only require @instana/autoprofile if profiling has been enabled.
- Fix: Recover gracefully from absence of @instana/autoprofile (since it is an optional dependency).

## 1.100.1
- Add more mongodb command names for collection lookup.

## 1.100.0
- Provide an API to manually restore the asynchronous context (async_hooks/AsyncWrap continuity) as a workaround for libraries that break it.

## 1.99.0
- [AWS Fargate] In-process data collection for AWS Fargate tasks via new package `@instana/aws-fargate` (alpha). Requires at least Instana back end version 178. `@instana/aws-fargate` supports Node.js 8.6.0 or later.

## 1.98.1
- Fix PID used in profiling payload when running in a container.

## 1.98.0
- Add `@instana/autoprofile` to support [Instana AutoProfile™](https://www.ibm.com/docs/de/obi/current?topic=instana-profile-processes) (automated and continuous production profiler). Instana AutoProfile is currently opt-in and can be enabled with the config option `autoProfile: true` or via the environment variable `INSTANA_AUTO_PROFILE=true`.

## 1.97.1
- Update to `netlinkwrapper@1.2.0`.
- Fix `span.annotate` to support paths to nested properties (paths can be strings as well as arrays).
- Fix: Protect a custom path template from being overwritten by instrumented middleware running later.

## 1.97.0
- [AWS Lambda] Add support for `INSTANA_ENDPOINT_PROXY` (send data to Instana via a proxy).
- Add support for Node.js 14.
- Update to `event-loop-stats@1.3.0`, to support detecting synchronous event loop blocking.

## 1.96.0
- Instrument [@elastic/elasticsearch](https://www.npmjs.com/package/@elastic/elasticsearch) (aka modern Elasticsearch client).
- Fix instrumentation for legacy Elasticsearch client (https://www.npmjs.com/package/elasticsearch), do not discard subsequent exit spans.
- Make instrumentation robust against https://github.com/montagejs/collections/issues/178.
- Make check for disabled instrumentation stricter (the keys provided in config.tracing.disabledTracers/INSTANA_DISABLED_TRACERS need to be an exact, case-insensitive match of the instrumentation file now). If you have used this configuration option and relied on the fact that this was a string.contains check previously, you might need to update your config.

## 1.95.2
- [AWS Lambda] Fix: Add a connection timeout in addition to the read/idle timeout.

## 1.95.1
- Capture the error message and/or stack trace when completing and SDK span with an error.

## 1.95.0
- Support deployment scenario in which the whole application is installed from a registry via npm install instead of only its dependencies.

## 1.94.0
- [AWS Lambda] Fix stale timeout events on socket object induced by AWS Lambda runtime freezing and thawing the process.
- Support X-INSTANA-SYNTHETIC.

## 1.93.0
- Support tracing of deferred HTTP exits (that is, capture HTTP exits if the entry that triggered it has already finished).
- [AWS Lambda] Add support for INSTANA_DISABLE_CA_CHECK.

## 1.92.5
- [AWS Lambda] Reset `requestHasFailed` flag on start of Lambda handler.
- [AWS Lambda] Improve logging for data reporting timeouts.
- [AWS Lambda] Remove misleading "Traces and metrics have been sent to Instana." message.
- Remove deprecated span attributes `span.error` and `span.async`.
- Remove obsolete configuration option `config.agentName`/`INSTANA_AGENT_NAME`.

## 1.92.4
- [AWS Lambda] Do not try to send data to the Instana back end when a previous request to it has already failed.
- [AWS Lambda] Change span offloading intervall to 5 seconds.
- [AWS Lambda] Make sure that an uninstrumented https connection is used for span offloading.
- [AWS Lambda] Change layer name from `instana` to `instana-nodejs` to prepare for the extension of native AWS Lambda tracing to other runtimes.

## 1.92.3
- Always capture duration of GraphQL calls.
- Support `INSTANA_DEBUG` in native serverless tracing.

## 1.92.2
- Do not remove tags from lower priority spans when changing the span type (e.g. http -> graphql)

## 1.92.1
- Fix mongodb tracing for outdated versions of the mongodb package.

## 1.92.0
- Support for new website monitoring/mobile back end correlation via extended X-INSTANA-L header.
- Capture request and response headers on outgoing HTTP calls.

## 1.91.0
- Support for [W3C Trace Context](https://www.w3.org/TR/trace-context/).
- Fix: Annotate path templates (Express.js, Koa, Hapi, ...) and error messages (Express.js) on all HTTP entry spans, not only on root spans.

## 1.90.0
- Add API method to annotate spans with custom tags.

## 1.89.1
- Rewrite MongoDB instrumentation from scratch without using its APM API (which makes it hard to keep the trace context across async calls).

## 1.89.0
- Instrument [Apigee Microgateway/edgemicro's](https://www.npmjs.com/package/edgemicro) worker processes automatically when they are spawned.
- Provide an executable for static instrumentation of a globally installed [edgemicro](https://www.npmjs.com/package/edgemicro) CLI (see [our docs](https://www.ibm.com/docs/de/obi/current?topic=technologies-monitoring-apigee-microgateway) for details).
- Keep asynchronous context across [memored](https://www.npmjs.com/package/memored) IPC communication gaps.

## 1.88.1
- [AWS Lambda] Replace intid value if it already exists in the Server-Timing header (in case the same result object is reused for multiple requests).

## 1.88.0
- Also support Winston 1.x and 2.x plus [`express-winston`](https://www.npmjs.com/package/express-winston) (in addition to Winston >= 3.x, which is already supported).

## 1.87.0
- Improve support for [Apollo Federation](https://www.apollographql.com/docs/apollo-server/federation/introduction/) by instrumenting [@apollo/gateway](https://www.npmjs.com/package/@apollo/gateway).
- Downgrade log level for missing package.json in potential depedency directory from info to debug.

## 1.86.0
- Add instrumentation for [pg-native](https://www.npmjs.com/package/pg-native) (`pg-native` is an alternative PostgreSQL driver package, in addition to the already supported [pg](https://www.npmjs.com/package/pg) package).

## 1.85.0
- [AWS Lambda] Reduce execution time penalty for native AWS Lambda tracing even further.
- Refactor agentready state to not use closures.

## 1.84.3
- [AWS Lambda] Avoid duplicated postHandler calls.

## 1.84.2
- [AWS Lambda] Call original callback in wrapped context.succeed/context.fail/context.done.
- Allow GraphQL tracing over other protocols in addition to HTTP.

## 1.84.1
- Also capture incoming HTTP calls that time out on the client side or are aborted on the server side (via `req.destroy()`).

## 1.84.0
- Add support for the [log4js](https://www.npmjs.com/package/log4js) logging package.
- [AWS Lambda] Instrument deprecated legacy Lambda API (context.done, context.succeed, and context.fail).
- Fix stack trace capturing for Winston log calls.

## 1.83.0
- Add kafkajs instrumentation ([kafkajs](https://www.npmjs.com/package/kafkajs)).

## 1.82.1
- Trace MySql pool cluster calls.

## 1.82.0
- Capture synchronous errors in Lambda functions.
- Handle ARN correctly when a Lambda function is called via an alias.

## 1.81.1
- Fully cover Winston 3.x API surface.

## 1.81.0
- Provide access to Instana Node.js API via `@instana/aws-lambda`.
- Add instana.sdk.async alias for instana.sdk.promise.

## 1.80.0
- Add ability to disable individual tracers via `config.tracing.disabledTracers` or `INSTANA_DISABLED_TRACERS`.

## 1.79.1
- [AWS Lambda] Cache target handler across invocations.

## 1.79.0
- Add auto-wrap package for AWS Lambda to enable Lambda tracing without code modification.

## 1.78.1
- Only use `X-Instana-Service` HTTP header when agent is configured to capture it.

## 1.78.0
- Support `INSTANA_SERVICE_NAME`/`config.serviceName` for auto-tracing and SDK spans. Previously, this has only been supported for OpenTracing spans.
- Support `X-Instana-Service` HTTP header.

## 1.77.0
- [AWS Lambda] Inject EUM back end correlation header in AWS Lambda responses if possible.

## 1.76.0
- Do not add tracing headers to signed aws-sdk HTTP requests.
- Extract serverless utilities that are not specific to the AWS Lambda platform into their own utility package, @instana/serverless.
- Log a warning when @instana/collector has been initialized too late. Additionally, this will be transmitted as snapshot data.

## 1.75.0
- Capture HTTP response headers for HTTP entry spans.

## 1.74.2
- [AWS Lambda] Support new environment variables `INSTANA_ENDPOINT_URL` and `INSTANA_AGENT_KEY` in addition to the now deprecated variables `INSTANA_URL` and `INSTANA_KEY`.

## 1.74.1
- [AWS Lambda] Improve logging.

## 1.74.0
- [AWS Lambda] In-process data collection for AWS Lambdas via new package @instana/aws-lambda (beta).

## 1.73.2
- Move some metrics from core to collector package.

## 1.73.1
- Fix cases where GraphQL tracing would break when another non-HTTP entry span is already active.

## 1.73.0
- Allow early init of instrumentations (experimental).

## 1.72.1
- Improve announce cycle by polling for the "agent ready" state once a second, this will bring the delay from "announce" to "agent ready" down from 10 to ~1 seconds for the majority of cases (in particular with the improved agent to be released soon).
- Enforce minimum delay of one second between sending snapshot data and the first spans.

## 1.72.0
- Add NATS.io instrumentation ([nats](https://www.npmjs.com/package/nats)).
- Add NATS streaming instrumentation ([node-nats-streaming](https://www.npmjs.com/package/node-nats-streaming)).

## 1.71.3
- Fix: Add MongoDB command details for update, replace and delete operations.

## 1.71.2
- Avoid triggering fastify's `basePath` deprecation warning.

## 1.71.1
- Remove overaggressive validation warning for HTTP spans.

## 1.71.0
- Add support for kafka-node >= 4.0.0.
- Bunyan: support for capturing the error message from a nested error object (attribute `err`) given in the fields argument.

## 1.70.0
- Enable uncaught exception reporting in Node 12.x.

## 1.69.2
- Fix cases where span.ec would be overwritten by http server instrumentation.

## 1.69.1
- Trace through graphql-subscriptions PubSub/AsyncIterator.
- Add missing cls.ns.exit calls in mongodb instrumentation (fix for leaking `cls.ns._set` entries).

## 1.69.0
- Add graphql instrumentation ([graphql](https://www.npmjs.com/package/graphql)).

## 1.68.4
- Require `cls-bluebird` before installing the require hook for `bluebird` so client code can use `cls-bluebird` without conflicts ([#152](https://github.com/instana/nodejs/pull/152), thanks to @jonathansamines).
- Fix tracing of `https` client calls in Node.js 8.9.0.

## 1.68.3
- Add additional check to `requireHook` in case other modules interfering with `require` (like `require-in-the-middle`) are present.

## 1.68.2
- Remove circular references from span data before serializing it ([#148](https://github.com/instana/nodejs/pull/148), thanks to @sklose).

## 1.68.1
- Log a warning instead of info when running an unsupported Node.js version.

## 1.68.0
- Improve configuration handling, support more environment variables.
- Record [hapi.js](https://hapijs.com/) routes as path templates when tracing HTTP entries.
- Fix wrong warnings in validation for entry spans (that no other span is already in progress) for HTTP(s) entries.

## 1.67.2
- Read X-INSTANA-... headers case-insensitive in amqp instrumentation.
- Fix handling of Fastify routes with an beforeHandler array.

## 1.67.1
- Fix: Handle koa routes defined by regular expressions.

## 1.67.0
- Add support for Node.js 12 (except for two optional features that rely on native addons which are not yet available for Node.js 12, CPU profiling and reporting uncaught exceptions).

## 1.66.0
- Report unhandled promise rejections as issues (disabled by default, see [configuration guide](https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-configuration#reporting-unhandled-promise-rejections)).

## 1.65.1
- Fix: Init metrics correctly when no config is passed ([#138](https://github.com/instana/nodejs/issues/138)).
- Add data.rpc.host and data.rpc.port to GRPC exits to improve service discovery.

## 1.65.0
- Rename the npm package from instana-nodejs-sensor to @instana/collector. See [migration guide](https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#change-of-package-name) for details.
- Split into @instana/core and @instana/collector.
- Fix trace context continuity when multiple instances of `bluebird` are present.

## 1.64.0
- Add tracing SDK to create spans manually, integrating seamlessly with automatic tracing - see [SDK API documentation](https://www.ibm.com/docs/de/obi/current?topic=nodejs-instana-api#creating-spans-manually-with-the-sdk) for details.
- Additional validation for entry spans (that no other span is already in progress).

## 1.63.2
- Remove deprecated span attribute span.b.u (redis, ioredis).

## 1.63.1
- Fix: Set GRPC headers instead of adding them.

## 1.63.0
- Limit content length of requests when talking to the agent.
- Fix: Handle non-pooled pg queries using the promise API correctly.

## 1.62.0
- Extend API: Offer various getters to inquire about details of the currently actice span (trace ID, span ID and other attributes).
- Improve generated IDs (span ID, trace ID).
- Fix: Make sure timeouts created by instana-nodejs-sensor do not prevent the process from terminating.

## 1.61.2
- Fix for GRPC instrumentation: Add original attributes to shimmed client method.

## 1.61.1
- Fix: Add missing instrumentation hooks for mysql/mysql2#execute.

## 1.61.0
- Accept values of type string for config.tracing.stackTraceLength.

## 1.60.3
- Fix an issue in the GRPC instrumentation when an options object is provided.

## 1.60.2
- Fix duplicated cls binds in postgres and mssql instrumentation.

## 1.60.1
- Fix error when a Pino logger was passed via config (#119).

## 1.60.0
- Instrument Elasticsearch operations msearch and mget ([#117](https://github.com/instana/nodejs/pull/117), thanks to @DtRWoS).

## 1.59.0
- Add GRPC instrumentation ([grpc](https://www.npmjs.com/package/grpc)).

## 1.58.0
- Support Node.js 11.

## 1.57.0
- Provide an API to set a logger after initialization to resolve init/logger cycle.

## 1.56.0
- Record [koa-router](https://github.com/alexmingoia/koa-router) routes as path templates when tracing HTTP entries.
- Improve announce payload.
- Left pad generated IDs with '0'.

## 1.55.2
- Fix: Add HTTP query params for HTTP exits.
- Fix: Do not capture HTTP headers for HTTP exits (only for entries).
- Fix: Capture erroneous span on synchronous exceptions in HTTP client (like malformed URL).

## 1.55.1
- Fix method name of NoopSpanHandle.

## 1.55.0
- Provide API to end spans manually to allow capturing of child exit spans for message consumers (RabbitMQ/amqplib, Kafka).

## 1.54.2
- Fix broken trace context in some MongoDB usage scenarios.

## 1.54.1
- RabbitMQ/amqplib: Small fix for TLS AMQP Urls (amqps).

## 1.54.0
- Instrument [Bunyan](https://github.com/trentm/node-bunyan).
- Pino: Improve tracing for error objects.

## 1.53.0
- Instrument [Winston](https://github.com/winstonjs/winston).
- Exclude file system entries that are not directories in dependency analysis, fixes confusing warning.

## 1.52.0
- Instrument [Pino](http://getpino.io/).
- Allow other (non-Bunyan) loggers to be injected ([#88](https://github.com/instana/nodejs/pull/88), thanks to @SerayaEryn).

## 1.51.0
- Instrument amqplib (RabbitMQ tracing).

## 1.50.1
- Fix: Do not attach context to error/exception objects (#90).

## 1.50.0
- Update to latest emitter-listener package to include [latest fix](https://github.com/othiym23/emitter-listener/pull/6).
- Update a number of dependencies (bunyan, event-loop-lag, opentracing, shimmer, ...).
- Fix minor issues reported by npm audit.

## 1.49.1
- Fix: Do not fail when http client options object has a headers attribute with value.

## 1.49.0
- Enable CPU profiling for Node.js 10 apps.
- Warn about missing dependency netlinkwrapper at startup when reporting of uncaught exceptions is enabled.
- Fix: Uncaught exception reporting can now be enabled on systems using musl libc instead of glibc (e.g. Alpine Linux).

## 1.48.1
- Fix secret scrubbing for HTTP server instrumentation.

## 1.48.0
- Various fixes and improvements for the HTTP client instrumentation:
    - support for http(s).request(url, options, callback) API introduced in Node.js 10.9.0,
    - support for WHATWG URL objects,
    - fix for requests with header "Expect: 100-continue", and
    - instrument http.get and https.get separately from http(s).request.

## 1.47.1
- MySQL: Fix for MySQL instrumentation sometimes losing the tracing context.

## 1.47.0
- Add MSSQL (Microsoft SQL Server) instrumentation (supports [mssql](https://www.npmjs.com/package/mssql), version >= 4 via [tedious driver](https://www.npmjs.com/package/tedious)).
- Tracing support for [mongodb](https://www.npmjs.com/package/mongodb) version >= 3.0.6.

## 1.46.0
- Support a wider range of command names for identification of PID in parent PID namespace.
- Report uncaught exceptions as incidents and via span/trace (disabled by default).

## 1.45.0
- Record `https` client calls.

## 1.44.2
- Fix result handling in PostgreSQL instrumentation.

## 1.44.1
- Do not break when modules use `stealthy-require` or similar mechanisms.

## 1.44.0
- Record fastify path templates when tracing HTTP entries.

## 1.43.0
- Record express.js path templates when tracing HTTP entries.

## 1.42.0
- Expose a debugging action to learn about loaded modules.
- Allow retrieval of `package.json` files.

## 1.41.0
- Add PostgreSQL instrumentation ([pg](https://www.npmjs.com/package/pg)).

## 1.40.2
- Avoid sending batch size 0 for Redis multi commands.

## 1.40.1
- Only try to instrument bluebird if it is actually available.

## 1.40.0
- Include additional debugging data in log when data transmission to agent fails.
- Support recording of user-configurable HTTP headers in HTTP client and server instrumentation.

## 1.39.0
- Include reporting PID in agent logs.

## 1.38.3
- Protect spans from accidental retransmission.
- Abort HTTP requests to the agent on timeouts.
- HTTP client instrumentation does not correctly interpret HTTP client timeouts.

## 1.38.2
- ioredis: Correctly manage tracing context in ioredis instrumentation.

## 1.38.1
- OpenTracing baggage is not defined on span context when using `getCurrentlyActiveInstanaSpanContext`.

## 1.38.0
- Enable tracing in Node.js `^10.0.0`.
- Regression in MongoDB instrumentation which attempts to access optional `operationId` properties.

## 1.37.3
- Prepare support for 128bit trace IDs.
- Reduce memory footprint when using HTTP agents with `maxSockets: Infinity`.

## 1.37.2
- MongoDB: Properly initialize and assure operationId is generated.

## 1.37.1
- ioRedis instrumentation can lead to errors when async correlation doesn't work as expected.
- Add tracing support for mysql2/promise.
- Switch to `@risingstack/v8-profiler` due to security issues in transitive dependencies of `v8-profiler`.

## 1.37.0
- Enable tracing in Node.js `^9.1.0`.

## 1.36.1
- Reduce severity in log messages which describe dependency analysis failures.
- Upgrade `event-loop-lag` to address [security vulnerability](https://nodesecurity.io/advisories/534) in `debug`.

## 1.36.0
- Fix support for mysql2 versions prior to 1.5.0.
- Read env vars by default to determine agent connection config.

## 1.35.1
- HTTPS exit spans can have the wrong protocol set.

## 1.35.0
- Fix an async correlation issue caused by outgoing HTTP calls.
- Do not enable tracing in Node.js v9
- Limit maximum database statement length that is stored in spans.
- MongoDB spans are nested in a wrong way.

## 1.34.1
- Allow retrieval of TypeScipt and JSX files via the backchannel.

## 1.34.0
- Call sequences are not recoded when using Redis.
- Add `batch` (pipeline) support for Redis.

## 1.33.0
- Add ioredis instrumentation.
- Exclude `exec` call from Redis instrumentation sub commands.

## 1.32.0
- Include details about uncaught errors in express handlers.

## 1.31.0
- Add redis instrumentation.

## 1.30.3
- HTTP tracing will report incorrect path in case of express.js router usage.

## 1.30.2
- Support HTTPS server tracing.

## 1.30.1
- Update `Server-Timing` response header in HTTP instrumentation to format of latest spec version.

## 1.30.0
- Use MIT license.

## 1.29.0
- MongoDB instrumentation tests fail intermittently
- Add automatic mysql2 instrumentation

## 1.28.1
- Node.js <=4.5.0 can have `Buffer.from`, but it does not accept a string. Thanks @libozh!
- Support announce to agent even when the Node.js process is renamed.
- Update supported versions; checks & tests

## 1.28.0
- Support automatic Node.js 8 tracing.

## 1.27.1
- Add Request query capture & reporting.

## 1.27.0
- HTTP client spans do not have the error count field `ec` set.
- It must be possible to run in manual tracing mode only.
- Support OpenTracing usage in Node.js 8.
- Support service naming for OpenTracing traces.

## 1.26.8
- Check for supported Node.js tracing versions marks v7 as unsupported.

## 1.26.7
- Data transmission is broken in Node.js 0.12.

## 1.26.6
- Encoding in communication between sensor and agent is only guaranteed via Node.js default opts.
- Transmission of data to agents will fail whenever a character is being transmitted that needs more than one byte.

## 1.26.5
- URL parsing results in measurable overhead in HTTP server tracing.

## 1.26.4
- MongoDB tracing writes filter information into the wrong property.

## 1.26.3
- Node.js v8 tracing is not yet possible. Automatically disable tracing when running within Node.js v8.

## 1.26.2
- Parent handle in hooks is unused and can result in memory leaks.

## 1.26.1
- OpenTracing is broken in version 0.14.0 and sensor support is incompatible.

## 1.26.0
- Allow configuration of agent host address to support environments in which iptables or other networking tricks are used. Contributed by @lowsky. Thank you!
- Upgrade opentracing to 0.14.0.

## 1.25.0
- Support tracing for the mysql module.

## 1.24.0
- Collect healthcheck results.

## 1.23.1
- Support CPU profiling in Node.js >=7.0.0

## 1.23.0
- Only publish the necessary runtime files.
- Support scoped modules in dependency analysis.
- Support the new OpenTracing span kinds `producer` and `consumer`.

## 1.22.0
- Add additional meta data to the agent announce information to enable discovery in Kubernetes and CloudFoundry environments.

## 1.21.1
- Remove duplicated HTTP metric gathering and reduce memory overhead.

## 1.21.0
- Expose trace ID for root spans in `Server-Timing` header.

## 1.20.3
- The Node.js tracing sensor on the agent side can be stopped. This will result in 404 errors which we should not log.

## 1.20.2
- Upgrade event-loop-lag because of security vulnerabilities in its dependency tree. Contributed by @jamessharp. Thank you!

## 1.20.1
- Source file retrieval is often broken. After discussions, we decided to relax the checks to only allow transmission of `*.js` files without validation of the location of the file.

## 1.20.0
- Add kafka-node tracing support.

## 1.19.1
- `getCurrentlyActiveInstanaSpanContext()` fails for modules which are using opentracing APIs while testing.

## 1.19.0
- Remove development and documentation artifacts from NPM published module.
- Execute tests against Node.js v7.
- Add opentracing support.

## 1.18.0
- Transport error counts in preparation for span batching logic.
- Log fewer stacktraces when agent identification fails.

## 1.17.6
- Strip matrix parameters and hash values from requests paths in addition to query parameters.

## 1.17.5
- Allow user access to trace IDs as automatically for extended EUM support.
- Stop setting cookies automatically for extended EUM support.

## 1.17.4
- Disable extended EUM support by default.

## 1.17.3
- Reported URLs for outgoing HTTP calls must include a `:` after the protocol name.

## 1.17.2
- Add a `Path` directive for EUM cookies to support sub directory resource requests.

## 1.17.1
- Use an `Expires` directive for EUM cookies to support IE<=8.

## 1.17.0
- Expose trace ID via response cookie so it may be picked up for EUM tracing.

## 1.16.0
- Enable tracing by default.

## 1.15.4
- Never generate negative span IDs to avoid negative hex values.

## 1.15.3
- Stringify Elasticsearch query to align with Java tracing implementation.

## 1.15.2
- Allow retrieval of loaded modules and of other JS files located in the require path.

## 1.15.1
- Allow retrieval of loaded modules via agent requests.
- Fix name of command property in MongoDB spans.

## 1.15.0
- Restrict CPU profiling support to Node.js >=4.0.0.
- Differentiate between all the supported V8 garbage collection types.

## 1.14.0
- Add on-demand CPU profiling support.

## 1.13.0
- Add MongoDB tracing.

## 1.12.1
- Format function name in stack traces as defined in the v8 Wiki.

## 1.12.0
- Capture stack traces for exit spans.

## 1.11.0
- Capture HTTP `Host` header on entry spans.

## 1.10.4
- Maintenance: Avoid header casing questions by always transmitting uppercase header names.

## 1.10.3
- Ensure compatibility with Zipkin by receiving span and trace IDs as hex.

## 1.10.2
- Ensure compatibility with Zipkin by transmitting span and trace IDs as hex.

## 1.10.1
- Transport cluster name in Elasticsearch spans to allow logical view creation.
- Transport full URL for HTTP exit spans.

## 1.10.0
- Be more careful about identification of agent hosts in cases where the identified URL is not actually a URL.
- Add tracing infrastructure.
- Add HTTP server tracing.
- Add HTTP client tracing.
- Add Elasticsearch tracing.

## 1.9.0
- Fix errors that can occur when logging to the agent.
- Combine app and runtime sensor.

## 1.8.0
- Use keep alive connections for all agent communication.
- Treat agent ready call timeouts as failed checks.

## 1.7.0
- Send logs to agent for ease of debugging.
- Fix agent communication issues were successive announce attempts resulted in announce problems.

## 1.6.2
- Determined PID is not transmitted to agent during announce phase.

## 1.6.1
- Do not depend on a specific command name when parsing `/proc/<pid>/sched` files.

## 1.6.0
- Read PID from `/proc/<pid>/sched` for increased robustness in cases where the Node.js sensor is running in a different PID namespace than the agent.

## 1.5.1
- Increase log level for failed agent communication to warn.

## 1.5.0
- Track Node.js internal handle and request counts.
- Report application start time to calculate uptime.

## 1.4.0
- Support Docker bridge networks by attempting agent communication with the container's default gateway.
- Support custom agent HTTP ports and name.

## 1.3.3
- Improve announce cycle stability.

## 1.3.2
- Use a more efficient data structure for heap space data.

## 1.3.1
- `v8` module does not exist in early Node.js versions.

## 1.3.0
- Retrieve heap space statistics.

## 1.2.0
- Support varying log levels and output destinations.

## 1.1.2
- Requests may hang and put sensor in endless announce cycle.

## 1.1.1
- Identification of `event-loop-stats` availability always fails.

## 1.1.0
- Allow sensor execution without native addons.

## 1.0.0
- Initial release
