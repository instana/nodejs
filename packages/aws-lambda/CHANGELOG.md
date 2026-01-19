# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [5.2.0](https://github.com/instana/nodejs/compare/v5.1.0...v5.2.0) (2026-01-19)


### Bug Fixes

* **aws-lambda:** improved ssm and coldstarts ([#2199](https://github.com/instana/nodejs/issues/2199)) ([a1e5208](https://github.com/instana/nodejs/commit/a1e5208d8aea50f52a235a75a75672d94a19192b))





# [5.1.0](https://github.com/instana/nodejs/compare/v5.0.2...v5.1.0) (2026-01-13)

**Note:** Version bump only for package @instana/aws-lambda





## [5.0.2](https://github.com/instana/nodejs/compare/v5.0.1...v5.0.2) (2025-12-16)

**Note:** Version bump only for package @instana/aws-lambda





## [5.0.1](https://github.com/instana/nodejs/compare/v5.0.0...v5.0.1) (2025-12-16)

**Note:** Version bump only for package @instana/aws-lambda





# [5.0.0](https://github.com/instana/nodejs/compare/v4.31.0...v5.0.0) (2025-12-16)


### Bug Fixes

* enforced Node.js 18.19 as the minimum supported version ([#2151](https://github.com/instana/nodejs/issues/2151)) ([5d688e2](https://github.com/instana/nodejs/commit/5d688e22ff03a6e4721a0363011002801a1ee045))
* removed deprecated config options for disabling tracing ([#2145](https://github.com/instana/nodejs/issues/2145)) ([efe07ed](https://github.com/instana/nodejs/commit/efe07ed7c5b09fa66869f8305ce9a829638c1e0c))


### BREAKING CHANGES

* Dropped support for Node.js versions below 18.19
* The following environment variables and configuration options, previously used to disable tracing, have been removed:
- INSTANA_DISABLED_TRACERS
- INSTANA_DISABLE_TRACING
- tracing.disabledTracers

Migration Recommendations:
Replace INSTANA_DISABLED_TRACERS and INSTANA_DISABLE_TRACING with INSTANA_TRACING_DISABLE.
Replace tracing.disabledTracers with tracing.disable.





# [4.31.0](https://github.com/instana/nodejs/compare/v4.30.1...v4.31.0) (2025-12-08)


### Bug Fixes

* **aws-lambda-auto-wrap:** stopped publishing to npm ([#2185](https://github.com/instana/nodejs/issues/2185)) ([3e83397](https://github.com/instana/nodejs/commit/3e83397fdb7e7c03f90be95ce2d629c1ebeb0c3b))
* **serverless:** resolved TypeError when agent key is not available ([#2197](https://github.com/instana/nodejs/issues/2197)) ([d24e759](https://github.com/instana/nodejs/commit/d24e759cd220dfb92975d88fd845cd3de5b99ad2))


### Features

* **aws-lambda:** added support for Node v24 runtime ([#2174](https://github.com/instana/nodejs/issues/2174)) ([71e11fb](https://github.com/instana/nodejs/commit/71e11fbee4008ea3a3fda209805f0e6f03e01413))
* **iaws-lambda:** added runtime-aware handler support for Node.js 24 compatibility ([#2195](https://github.com/instana/nodejs/issues/2195)) ([35a7fbc](https://github.com/instana/nodejs/commit/35a7fbc9ede5119a7c48d15823f390f407889311))





## [4.30.1](https://github.com/instana/nodejs/compare/v4.30.0...v4.30.1) (2025-11-18)

**Note:** Version bump only for package @instana/aws-lambda





# [4.30.0](https://github.com/instana/nodejs/compare/v4.29.0...v4.30.0) (2025-11-17)

**Note:** Version bump only for package @instana/aws-lambda





# [4.29.0](https://github.com/instana/nodejs/compare/v4.28.0...v4.29.0) (2025-11-07)

**Note:** Version bump only for package @instana/aws-lambda





# [4.28.0](https://github.com/instana/nodejs/compare/v4.27.1...v4.28.0) (2025-11-06)

**Note:** Version bump only for package @instana/aws-lambda





## [4.27.1](https://github.com/instana/nodejs/compare/v4.27.0...v4.27.1) (2025-11-03)

**Note:** Version bump only for package @instana/aws-lambda





# [4.27.0](https://github.com/instana/nodejs/compare/v4.26.4...v4.27.0) (2025-10-23)

**Note:** Version bump only for package @instana/aws-lambda





## [4.26.4](https://github.com/instana/nodejs/compare/v4.26.3...v4.26.4) (2025-10-21)

**Note:** Version bump only for package @instana/aws-lambda





## [4.26.3](https://github.com/instana/nodejs/compare/v4.26.2...v4.26.3) (2025-10-21)

**Note:** Version bump only for package @instana/aws-lambda





## [4.26.2](https://github.com/instana/nodejs/compare/v4.26.1...v4.26.2) (2025-10-15)

**Note:** Version bump only for package @instana/aws-lambda





## [4.26.1](https://github.com/instana/nodejs/compare/v4.26.0...v4.26.1) (2025-10-13)


### Bug Fixes

* **aws-lambda:** resolved timeout when INSTANA_AGENT_KEY is not provided ([#2058](https://github.com/instana/nodejs/issues/2058)) ([cba173a](https://github.com/instana/nodejs/commit/cba173a5d9d5867eb9c81fafbb91951f28d071e6))





# [4.26.0](https://github.com/instana/nodejs/compare/v4.25.0...v4.26.0) (2025-10-08)


### Bug Fixes

* **aws-lambda:** reduced lambda extension binary size ([#2044](https://github.com/instana/nodejs/issues/2044)) ([8bbed42](https://github.com/instana/nodejs/commit/8bbed4288259602e233946d70a6d54abca06fa81))





# [4.25.0](https://github.com/instana/nodejs/compare/v4.24.1...v4.25.0) (2025-09-23)

**Note:** Version bump only for package @instana/aws-lambda





## [4.24.1](https://github.com/instana/nodejs/compare/v4.24.0...v4.24.1) (2025-09-18)

**Note:** Version bump only for package @instana/aws-lambda





# [4.24.0](https://github.com/instana/nodejs/compare/v4.23.1...v4.24.0) (2025-09-11)

**Note:** Version bump only for package @instana/aws-lambda





## [4.23.1](https://github.com/instana/nodejs/compare/v4.23.0...v4.23.1) (2025-09-01)

**Note:** Version bump only for package @instana/aws-lambda





# [4.23.0](https://github.com/instana/nodejs/compare/v4.22.0...v4.23.0) (2025-08-25)


### Bug Fixes

* **aws-lambda:** updated brace-expansion in icr.io/instana/aws-lambda-nodejs image ([#1944](https://github.com/instana/nodejs/issues/1944)) ([4665738](https://github.com/instana/nodejs/commit/46657386b6aef1500d9747cdeaee3ff802510416))





# [4.22.0](https://github.com/instana/nodejs/compare/v4.21.3...v4.22.0) (2025-08-13)

**Note:** Version bump only for package @instana/aws-lambda





## [4.21.3](https://github.com/instana/nodejs/compare/v4.21.2...v4.21.3) (2025-08-07)


### Bug Fixes

* **aws-lambda:** improved coldstarts ([#1933](https://github.com/instana/nodejs/issues/1933)) ([cfede29](https://github.com/instana/nodejs/commit/cfede297893f4535b6a53602a8737c07cb4c7f5a))





## [4.21.2](https://github.com/instana/nodejs/compare/v4.21.1...v4.21.2) (2025-08-05)

**Note:** Version bump only for package @instana/aws-lambda





## [4.21.1](https://github.com/instana/nodejs/compare/v4.21.0...v4.21.1) (2025-08-05)

**Note:** Version bump only for package @instana/aws-lambda





# [4.21.0](https://github.com/instana/nodejs/compare/v4.20.0...v4.21.0) (2025-07-31)


### Features

* **aws-lambda:** improved overhaul performance ([#1315](https://github.com/instana/nodejs/issues/1315)) ([4620113](https://github.com/instana/nodejs/commit/46201132dac6a73e7719d085c4edaa5c5a5ae526))





# [4.20.0](https://github.com/instana/nodejs/compare/v4.19.1...v4.20.0) (2025-07-30)

**Note:** Version bump only for package @instana/aws-lambda





## [4.19.1](https://github.com/instana/nodejs/compare/v4.19.0...v4.19.1) (2025-07-25)


### Bug Fixes

* **serverless:** resolved maximum call stack error ([#1877](https://github.com/instana/nodejs/issues/1877)) ([985b3c1](https://github.com/instana/nodejs/commit/985b3c165b0533a068e9e37c1e0b99a1fbfb4da0))





# [4.19.0](https://github.com/instana/nodejs/compare/v4.18.1...v4.19.0) (2025-07-24)


### Bug Fixes

* **serverless:** removed trailing slashes from instana endpoint url ([#1862](https://github.com/instana/nodejs/issues/1862)) ([305f2b2](https://github.com/instana/nodejs/commit/305f2b249900d6e5e0ffb7b305b486fd1cf2621a))





## [4.18.1](https://github.com/instana/nodejs/compare/v4.18.0...v4.18.1) (2025-07-14)

**Note:** Version bump only for package @instana/aws-lambda





# [4.18.0](https://github.com/instana/nodejs/compare/v4.17.0...v4.18.0) (2025-07-10)

**Note:** Version bump only for package @instana/aws-lambda





# [4.17.0](https://github.com/instana/nodejs/compare/v4.16.0...v4.17.0) (2025-06-30)


### Bug Fixes

* depreacted INSTANA_DISABLE_TRACING env variable ([#1796](https://github.com/instana/nodejs/issues/1796)) ([4559cb8](https://github.com/instana/nodejs/commit/4559cb82ae955d77d10e991f544bdf2c1d17fe62))





# [4.16.0](https://github.com/instana/nodejs/compare/v4.15.3...v4.16.0) (2025-06-24)


### Bug Fixes

* **collector:** optimized flushing spans before application dies ([#1765](https://github.com/instana/nodejs/issues/1765)) ([3507599](https://github.com/instana/nodejs/commit/35075996e879734a7bb9437c1ce375b9d979fe3a)), closes [#1315](https://github.com/instana/nodejs/issues/1315)





## [4.15.3](https://github.com/instana/nodejs/compare/v4.15.2...v4.15.3) (2025-06-11)

### Bug Fixes

- **aws-lambda:** resolved x86_64 build ([#1763](https://github.com/instana/nodejs/issues/1763)) ([de7769f](https://github.com/instana/nodejs/commit/de7769ff49562df42ceffa9e689dac1bfa04d1cc))

## [4.15.2](https://github.com/instana/nodejs/compare/v4.15.1...v4.15.2) (2025-06-11)

### Bug Fixes

- **aws-lambda:** upgraded go version to 1.24.0 ([#1761](https://github.com/instana/nodejs/issues/1761)) ([87dc123](https://github.com/instana/nodejs/commit/87dc12338f94a657cad883bd78b8a6598d362213))

## [4.15.1](https://github.com/instana/nodejs/compare/v4.15.0...v4.15.1) (2025-06-09)

### Bug Fixes

- **aws-lambda:** gracefully handled non-string path values ([#1750](https://github.com/instana/nodejs/issues/1750)) ([8625634](https://github.com/instana/nodejs/commit/86256346600ae4bffa5f982fe79dff898f4d4588))

# [4.15.0](https://github.com/instana/nodejs/compare/v4.14.0...v4.15.0) (2025-05-27)

**Note:** Version bump only for package @instana/aws-lambda

# [4.14.0](https://github.com/instana/nodejs/compare/v4.13.0...v4.14.0) (2025-05-13)

**Note:** Version bump only for package @instana/aws-lambda

# [4.13.0](https://github.com/instana/nodejs/compare/v4.12.0...v4.13.0) (2025-05-08)

**Note:** Version bump only for package @instana/aws-lambda

# [4.12.0](https://github.com/instana/nodejs/compare/v4.11.1...v4.12.0) (2025-05-06)

### Bug Fixes

- **aws-lambda:** resolved TypeError when memory is too low ([#1715](https://github.com/instana/nodejs/issues/1715)) ([03a8eb3](https://github.com/instana/nodejs/commit/03a8eb39f386af44f98c5405d668369b3736bff0))

## [4.11.1](https://github.com/instana/nodejs/compare/v4.11.0...v4.11.1) (2025-04-24)

**Note:** Version bump only for package @instana/aws-lambda

# [4.11.0](https://github.com/instana/nodejs/compare/v4.10.0...v4.11.0) (2025-04-22)

**Note:** Version bump only for package @instana/aws-lambda

# [4.10.0](https://github.com/instana/nodejs/compare/v4.9.0...v4.10.0) (2025-04-01)

**Note:** Version bump only for package @instana/aws-lambda

# [4.9.0](https://github.com/instana/nodejs/compare/v4.8.0...v4.9.0) (2025-03-20)

**Note:** Version bump only for package @instana/aws-lambda

# [4.8.0](https://github.com/instana/nodejs/compare/v4.7.0...v4.8.0) (2025-03-19)

### Features

- **serverless:** added request id to instana debug logs ([#1623](https://github.com/instana/nodejs/issues/1623)) ([c5a1b69](https://github.com/instana/nodejs/commit/c5a1b691ed9f01363bbc76bc262f985a4901744e))

# [4.7.0](https://github.com/instana/nodejs/compare/v4.6.3...v4.7.0) (2025-03-11)

**Note:** Version bump only for package @instana/aws-lambda

## [4.6.3](https://github.com/instana/nodejs/compare/v4.6.2...v4.6.3) (2025-03-05)

### Bug Fixes

- **aws-lambda:** ensured tracer is properly disabled when configured ([#1593](https://github.com/instana/nodejs/issues/1593)) ([a1db8b4](https://github.com/instana/nodejs/commit/a1db8b4b79cddbe2be871cdbd81290b9879937f2)), closes [#1315](https://github.com/instana/nodejs/issues/1315)

## [4.6.2](https://github.com/instana/nodejs/compare/v4.6.1...v4.6.2) (2025-02-24)

**Note:** Version bump only for package @instana/aws-lambda

## [4.6.1](https://github.com/instana/nodejs/compare/v4.6.0...v4.6.1) (2025-01-29)

**Note:** Version bump only for package @instana/aws-lambda

# [4.6.0](https://github.com/instana/nodejs/compare/v4.5.3...v4.6.0) (2025-01-18)

**Note:** Version bump only for package @instana/aws-lambda

## [4.5.3](https://github.com/instana/nodejs/compare/v4.5.2...v4.5.3) (2025-01-14)

### Bug Fixes

- resolved more logging objects structure ([#1510](https://github.com/instana/nodejs/issues/1510)) ([bd4c9bb](https://github.com/instana/nodejs/commit/bd4c9bbda2c82aee7f6c59fcca03ac5588566839))

## [4.5.2](https://github.com/instana/nodejs/compare/v4.5.1...v4.5.2) (2025-01-13)

### Bug Fixes

- resolved logging objects being undefined or missing ([#1509](https://github.com/instana/nodejs/issues/1509)) ([7715fed](https://github.com/instana/nodejs/commit/7715fed5843716a6e49d79f221efcec33a9a1c9d))

## [4.5.1](https://github.com/instana/nodejs/compare/v4.5.0...v4.5.1) (2025-01-13)

**Note:** Version bump only for package @instana/aws-lambda

# [4.5.0](https://github.com/instana/nodejs/compare/v4.4.0...v4.5.0) (2024-12-16)

**Note:** Version bump only for package @instana/aws-lambda

# [4.4.0](https://github.com/instana/nodejs/compare/v4.3.0...v4.4.0) (2024-12-12)

**Note:** Version bump only for package @instana/aws-lambda

# [4.3.0](https://github.com/instana/nodejs/compare/v4.2.0...v4.3.0) (2024-12-10)

**Note:** Version bump only for package @instana/aws-lambda

# [4.2.0](https://github.com/instana/nodejs/compare/v4.1.0...v4.2.0) (2024-11-22)

### Features

- **aws-lambda:** added support for Node v22 runtime ([#1456](https://github.com/instana/nodejs/issues/1456)) ([8b53e06](https://github.com/instana/nodejs/commit/8b53e06529517ec19067c7c49915f54b7e124e6c))

# [4.1.0](https://github.com/instana/nodejs/compare/v4.0.1...v4.1.0) (2024-11-19)

### Reverts

- Revert "test: updated test for aws lambda running in v24 prerelease" ([66e1d10](https://github.com/instana/nodejs/commit/66e1d10dd78f7874e33137c4c3bfaa376643a6e6))
- Revert "ci: removed chinese regions from publishing aws lambda layer" ([d44b619](https://github.com/instana/nodejs/commit/d44b6196ed10c272aa0e5186508bb70f7faee1c5))

## [4.0.1](https://github.com/instana/nodejs/compare/v4.0.0...v4.0.1) (2024-10-28)

### Bug Fixes

- **aws-lambda:** fixed error caused by missing aws-sdk during agent key retrieval from SSM ([#1402](https://github.com/instana/nodejs/issues/1402)) ([6329c66](https://github.com/instana/nodejs/commit/6329c6623e99d1f7eee5570dd9ebfa72bb953917))

### Reverts

- Revert "ci: skipped all other regions and only china region with debug" ([71f4643](https://github.com/instana/nodejs/commit/71f46431791c80af82e927361de9c9f5dd10e222))
- Revert "ci: skipping the Chinese regions from publishing lambda layers" ([1099189](https://github.com/instana/nodejs/commit/1099189dbce7840d0bebcae7a881a32d58c8fb27))

# [4.0.0](https://github.com/instana/nodejs/compare/v3.21.0...v4.0.0) (2024-10-23)

### Bug Fixes

- dropped support for lambda runtimes v14 and v16 ([#1352](https://github.com/instana/nodejs/issues/1352)) ([4d28d6b](https://github.com/instana/nodejs/commit/4d28d6b13b0299570b8b59c3f095fd76484e6f8b))
- dropped support for node v14 and v16 ([#1348](https://github.com/instana/nodejs/issues/1348)) ([aaa9ad4](https://github.com/instana/nodejs/commit/aaa9ad41ebf82b11eedcf913afc31d3addd53868))

### Reverts

- Revert "ci: skipping the chinese regions from publishing lambda layers" ([8475d69](https://github.com/instana/nodejs/commit/8475d6967311308bd36cc4ce4331bcb232beb031))

### BREAKING CHANGES

- - Dropped support for Node.js versions 14 and 16.

* Reason: These versions have reached their end of life.
* More info: https://github.com/nodejs/Release?tab=readme-ov-file#end-of-life-releases

- - Node.js Lambda runtimes v14 and v16 are no longer supported.

* Refer to the Lambda deprecation policy here: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html#runtime-support-policy

# [3.21.0](https://github.com/instana/nodejs/compare/v3.20.2...v3.21.0) (2024-10-17)

**Note:** Version bump only for package @instana/aws-lambda

## [3.20.2](https://github.com/instana/nodejs/compare/v3.20.1...v3.20.2) (2024-10-09)

### Reverts

- Revert "ci: skipping the chinese regions from publishing lambda layers" ([48adaca](https://github.com/instana/nodejs/commit/48adacac1c6e109f95c3280a40584e359d2f9c53))

## [3.20.1](https://github.com/instana/nodejs/compare/v3.20.0...v3.20.1) (2024-10-04)

**Note:** Version bump only for package @instana/aws-lambda

# [3.20.0](https://github.com/instana/nodejs/compare/v3.19.0...v3.20.0) (2024-10-01)

### Bug Fixes

- **lambda:** changed memory warning when using the lambda extension ([#1344](https://github.com/instana/nodejs/issues/1344)) ([3e94f9e](https://github.com/instana/nodejs/commit/3e94f9eeb7ba35822cc4bf663f3a8f30c3e3bcda))

# [3.19.0](https://github.com/instana/nodejs/compare/v3.18.2...v3.19.0) (2024-09-25)

**Note:** Version bump only for package @instana/aws-lambda

## [3.18.2](https://github.com/instana/nodejs/compare/v3.18.1...v3.18.2) (2024-09-17)

### Reverts

- Revert "ci: skipping the chinese region from publishing the lambda layers" ([45dcbb0](https://github.com/instana/nodejs/commit/45dcbb00ec4718597ff53acb7bb9ea138ac135d9))

## [3.18.1](https://github.com/instana/nodejs/compare/v3.18.0...v3.18.1) (2024-09-12)

**Note:** Version bump only for package @instana/aws-lambda

# [3.18.0](https://github.com/instana/nodejs/compare/v3.17.1...v3.18.0) (2024-09-06)

### Bug Fixes

- **serverless:** resolved printing debug logs by default ([#1317](https://github.com/instana/nodejs/issues/1317)) ([d5dfbd7](https://github.com/instana/nodejs/commit/d5dfbd74b54fdeb4d6535f53c32484402855961a)), closes [#1316](https://github.com/instana/nodejs/issues/1316)

## [3.17.1](https://github.com/instana/nodejs/compare/v3.17.0...v3.17.1) (2024-09-03)

**Note:** Version bump only for package @instana/aws-lambda

# [3.17.0](https://github.com/instana/nodejs/compare/v3.16.0...v3.17.0) (2024-09-02)

**Note:** Version bump only for package @instana/aws-lambda

# [3.16.0](https://github.com/instana/nodejs/compare/v3.15.2...v3.16.0) (2024-08-28)

### Reverts

- Revert "ci: skipped publishing AWS layer to the newly added region ap-southeast-5" ([038ff2d](https://github.com/instana/nodejs/commit/038ff2d75101012a123cb8c58ce2b730b6faaba9))

## [3.15.2](https://github.com/instana/nodejs/compare/v3.15.1...v3.15.2) (2024-08-27)

### Bug Fixes

- **aws-lambda:** improved debug logs for number of spans ([c7a3c34](https://github.com/instana/nodejs/commit/c7a3c3407ea83eeac2d54419163a0b2265a94bb6))

## [3.15.1](https://github.com/instana/nodejs/compare/v3.15.0...v3.15.1) (2024-08-19)

**Note:** Version bump only for package @instana/aws-lambda

# [3.15.0](https://github.com/instana/nodejs/compare/v3.14.4...v3.15.0) (2024-08-13)

**Note:** Version bump only for package @instana/aws-lambda

## [3.14.4](https://github.com/instana/nodejs/compare/v3.14.3...v3.14.4) (2024-07-22)

**Note:** Version bump only for package @instana/aws-lambda

## [3.14.3](https://github.com/instana/nodejs/compare/v3.14.2...v3.14.3) (2024-07-11)

**Note:** Version bump only for package @instana/aws-lambda

## [3.14.2](https://github.com/instana/nodejs/compare/v3.14.1...v3.14.2) (2024-07-09)

### Reverts

- Revert "ci: skipping the chinese region from publishing the lambda layers" ([078f9f7](https://github.com/instana/nodejs/commit/078f9f7b36607497097c9ffd6077b515428e83b6))
- Revert "test: publish aws lambda layer to cn-north-1 and skip other regions temporarily" ([47f8d32](https://github.com/instana/nodejs/commit/47f8d324f802f699d756a9ce8fc2e4df4e0c13a4))

## [3.14.1](https://github.com/instana/nodejs/compare/v3.14.0...v3.14.1) (2024-06-26)

**Note:** Version bump only for package @instana/aws-lambda

# [3.14.0](https://github.com/instana/nodejs/compare/v3.13.0...v3.14.0) (2024-06-26)

**Note:** Version bump only for package @instana/aws-lambda

# [3.13.0](https://github.com/instana/nodejs/compare/v3.12.0...v3.13.0) (2024-06-24)

**Note:** Version bump only for package @instana/aws-lambda

# [3.12.0](https://github.com/instana/nodejs/compare/v3.11.0...v3.12.0) (2024-06-21)

**Note:** Version bump only for package @instana/aws-lambda

# [3.11.0](https://github.com/instana/nodejs/compare/v3.10.0...v3.11.0) (2024-06-13)

### Bug Fixes

- **aws-lambda:** timeout not being activated when timeout is 3s ([60c99f4](https://github.com/instana/nodejs/commit/60c99f406b062e2a208762ed12b9bbee4915d235))

# [3.10.0](https://github.com/instana/nodejs/compare/v3.9.0...v3.10.0) (2024-06-13)

### Features

- **aws-lambda:** added optional timeout detection ([#1181](https://github.com/instana/nodejs/issues/1181)) ([41c9b77](https://github.com/instana/nodejs/commit/41c9b77246803e8b0cf14d1c9513283d6e5d0f58))

# [3.9.0](https://github.com/instana/nodejs/compare/v3.8.1...v3.9.0) (2024-05-28)

### Features

- added support for node-fetch v3 ([#1160](https://github.com/instana/nodejs/issues/1160)) ([b96f30c](https://github.com/instana/nodejs/commit/b96f30cfd80680917fc6993e2e47cd86102fd1be))

## [3.8.1](https://github.com/instana/nodejs/compare/v3.8.0...v3.8.1) (2024-05-17)

**Note:** Version bump only for package @instana/aws-lambda

# [3.8.0](https://github.com/instana/nodejs/compare/v3.7.0...v3.8.0) (2024-05-06)

**Note:** Version bump only for package @instana/aws-lambda

# [3.7.0](https://github.com/instana/nodejs/compare/v3.6.0...v3.7.0) (2024-05-03)

**Note:** Version bump only for package @instana/aws-lambda

# [3.6.0](https://github.com/instana/nodejs/compare/v3.5.0...v3.6.0) (2024-04-29)

**Note:** Version bump only for package @instana/aws-lambda

# [3.5.0](https://github.com/instana/nodejs/compare/v3.4.0...v3.5.0) (2024-04-24)

**Note:** Version bump only for package @instana/aws-lambda

# [3.4.0](https://github.com/instana/nodejs/compare/v3.3.1...v3.4.0) (2024-04-16)

**Note:** Version bump only for package @instana/aws-lambda

## [3.3.1](https://github.com/instana/nodejs/compare/v3.3.0...v3.3.1) (2024-04-11)

**Note:** Version bump only for package @instana/aws-lambda

# [3.3.0](https://github.com/instana/nodejs/compare/v3.2.1...v3.3.0) (2024-03-22)

**Note:** Version bump only for package @instana/aws-lambda

## [3.2.1](https://github.com/instana/nodejs/compare/v3.2.0...v3.2.1) (2024-03-18)

**Note:** Version bump only for package @instana/aws-lambda

# [3.2.0](https://github.com/instana/nodejs/compare/v3.1.3...v3.2.0) (2024-02-27)

### Bug Fixes

- depreacted request-promise module ([#1017](https://github.com/instana/nodejs/issues/1017)) ([6bb88dd](https://github.com/instana/nodejs/commit/6bb88dd4ca08d2482ff917fb3b9f884f4e4bdf8e))

## [3.1.3](https://github.com/instana/nodejs/compare/v3.1.2...v3.1.3) (2024-01-31)

**Note:** Version bump only for package @instana/aws-lambda

## [3.1.2](https://github.com/instana/nodejs/compare/v3.1.1...v3.1.2) (2024-01-29)

**Note:** Version bump only for package @instana/aws-lambda

## [3.1.1](https://github.com/instana/nodejs/compare/v3.1.0...v3.1.1) (2024-01-10)

### Bug Fixes

- resolved Lambda execution delay with env variable check ([#991](https://github.com/instana/nodejs/issues/991)) ([b6ed50b](https://github.com/instana/nodejs/commit/b6ed50b9a70e0f4af579e0cf66320d0b8ac36ca9))

# [3.1.0](https://github.com/instana/nodejs/compare/v3.0.0...v3.1.0) (2024-01-04)

### Features

- **aws-lambda:** added support for Node.js v20 runtime ([#975](https://github.com/instana/nodejs/issues/975)) ([7b44f8e](https://github.com/instana/nodejs/commit/7b44f8e814a81c589cbdd7bfc82eefa517336f14))

# [3.0.0](https://github.com/instana/nodejs/compare/v2.36.1...v3.0.0) (2023-12-12)

### Bug Fixes

- dropped node v10 and v12 ([#933](https://github.com/instana/nodejs/issues/933)) ([7e3ee32](https://github.com/instana/nodejs/commit/7e3ee32f7ef2ca60259eae40fd16ff24a6ec631b))

### BREAKING CHANGES

- Dropped Node v10 & v12 support.

## [2.36.1](https://github.com/instana/nodejs/compare/v2.36.0...v2.36.1) (2023-12-04)

**Note:** Version bump only for package @instana/aws-lambda

# [2.36.0](https://github.com/instana/nodejs/compare/v2.35.0...v2.36.0) (2023-11-29)

**Note:** Version bump only for package @instana/aws-lambda

# [2.35.0](https://github.com/instana/nodejs/compare/v2.34.1...v2.35.0) (2023-11-14)

### Bug Fixes

- adds version information for all NPM packages ([#906](https://github.com/instana/nodejs/issues/906)) ([3301aff](https://github.com/instana/nodejs/commit/3301aff98e4bdcbc2230912d7778836393ae6433))

## [2.34.1](https://github.com/instana/nodejs/compare/v2.34.0...v2.34.1) (2023-10-23)

**Note:** Version bump only for package @instana/aws-lambda

# [2.34.0](https://github.com/instana/nodejs/compare/v2.33.1...v2.34.0) (2023-10-10)

### Reverts

- Revert "chore: migrated to npm workspaces and lerna v7 (#876)" ([763ac7e](https://github.com/instana/nodejs/commit/763ac7e69d56742009e18964d267313918813c80)), closes [#876](https://github.com/instana/nodejs/issues/876)

## [2.33.1](https://github.com/instana/nodejs/compare/v2.33.0...v2.33.1) (2023-09-26)

**Note:** Version bump only for package @instana/aws-lambda

# [2.33.0](https://github.com/instana/nodejs/compare/v2.32.0...v2.33.0) (2023-09-18)

**Note:** Version bump only for package @instana/aws-lambda

# [2.32.0](https://github.com/instana/nodejs/compare/v2.31.0...v2.32.0) (2023-09-11)

**Note:** Version bump only for package @instana/aws-lambda

# [2.31.0](https://github.com/instana/nodejs/compare/v2.30.2...v2.31.0) (2023-09-04)

**Note:** Version bump only for package @instana/aws-lambda

## [2.30.2](https://github.com/instana/nodejs/compare/v2.30.1...v2.30.2) (2023-08-28)

**Note:** Version bump only for package @instana/aws-lambda

## [2.30.1](https://github.com/instana/nodejs/compare/v2.30.0...v2.30.1) (2023-08-25)

**Note:** Version bump only for package @instana/aws-lambda

# [2.30.0](https://github.com/instana/nodejs/compare/v2.29.0...v2.30.0) (2023-08-16)

**Note:** Version bump only for package @instana/aws-lambda

# [2.29.0](https://github.com/instana/nodejs/compare/v2.28.0...v2.29.0) (2023-07-31)

### Bug Fixes

- **tracing:** normalize incoming trace/span IDs from upstream tracers ([01e26d1](https://github.com/instana/nodejs/commit/01e26d110eb26b9143f33126f68e5594b00b32ea)), closes [#833](https://github.com/instana/nodejs/issues/833)

# [2.28.0](https://github.com/instana/nodejs/compare/v2.27.0...v2.28.0) (2023-07-27)

### Features

- **aws-lambda:** added support for missing regions ([#832](https://github.com/instana/nodejs/issues/832)) ([4d9904d](https://github.com/instana/nodejs/commit/4d9904dbb78dce4521bb604c3219844f1b55f147))

# [2.27.0](https://github.com/instana/nodejs/compare/v2.26.3...v2.27.0) (2023-07-24)

### Features

- **aws-lambda:** added function url support ([6f9fdb2](https://github.com/instana/nodejs/commit/6f9fdb20640d986c7af58a6a6d77f385336a8cb2))

## [2.26.3](https://github.com/instana/nodejs/compare/v2.26.2...v2.26.3) (2023-07-20)

**Note:** Version bump only for package @instana/aws-lambda

## [2.26.2](https://github.com/instana/nodejs/compare/v2.26.1...v2.26.2) (2023-07-17)

**Note:** Version bump only for package @instana/aws-lambda

## [2.26.1](https://github.com/instana/nodejs/compare/v2.26.0...v2.26.1) (2023-07-10)

**Note:** Version bump only for package @instana/aws-lambda

# [2.26.0](https://github.com/instana/nodejs/compare/v2.25.3...v2.26.0) (2023-07-04)

**Note:** Version bump only for package @instana/aws-lambda

## [2.25.3](https://github.com/instana/nodejs/compare/v2.25.2...v2.25.3) (2023-06-27)

**Note:** Version bump only for package @instana/aws-lambda

## [2.25.2](https://github.com/instana/nodejs/compare/v2.25.1...v2.25.2) (2023-06-22)

**Note:** Version bump only for package @instana/aws-lambda

## [2.25.1](https://github.com/instana/nodejs/compare/v2.25.0...v2.25.1) (2023-06-19)

### Bug Fixes

- **lambda:** avoid freezing outgoing requests ([#806](https://github.com/instana/nodejs/issues/806)) ([0e32399](https://github.com/instana/nodejs/commit/0e3239987dbc487050e8ff28168ad570af4e08a0))

# [2.25.0](https://github.com/instana/nodejs/compare/v2.24.0...v2.25.0) (2023-06-16)

**Note:** Version bump only for package @instana/aws-lambda

# [2.24.0](https://github.com/instana/nodejs/compare/v2.23.0...v2.24.0) (2023-06-13)

**Note:** Version bump only for package @instana/aws-lambda

# [2.23.0](https://github.com/instana/nodejs/compare/v2.22.1...v2.23.0) (2023-06-06)

### Features

- **aws-lambda:** added support for payload version format 2.0 ([#786](https://github.com/instana/nodejs/issues/786)) ([06c9780](https://github.com/instana/nodejs/commit/06c9780346620cb28a1d6d7225ad092039374333)), closes [#34347](https://github.com/instana/nodejs/issues/34347)

## [2.22.1](https://github.com/instana/nodejs/compare/v2.22.0...v2.22.1) (2023-05-15)

**Note:** Version bump only for package @instana/aws-lambda

# [2.22.0](https://github.com/instana/nodejs/compare/v2.21.1...v2.22.0) (2023-05-09)

**Note:** Version bump only for package @instana/aws-lambda

## [2.21.1](https://github.com/instana/nodejs/compare/v2.21.0...v2.21.1) (2023-05-02)

**Note:** Version bump only for package @instana/aws-lambda

# [2.21.0](https://github.com/instana/nodejs/compare/v2.20.2...v2.21.0) (2023-04-21)

**Note:** Version bump only for package @instana/aws-lambda

## [2.20.2](https://github.com/instana/nodejs/compare/v2.20.1...v2.20.2) (2023-04-06)

**Note:** Version bump only for package @instana/aws-lambda

## [2.20.1](https://github.com/instana/nodejs/compare/v2.20.0...v2.20.1) (2023-03-30)

**Note:** Version bump only for package @instana/aws-lambda

# [2.20.0](https://github.com/instana/nodejs/compare/v2.19.0...v2.20.0) (2023-03-24)

**Note:** Version bump only for package @instana/aws-lambda

# [2.19.0](https://github.com/instana/nodejs/compare/v2.18.1...v2.19.0) (2023-03-17)

### Features

- **aws-lambda:** add support for Node.js 18 AWS Lambda runtime ([0900ab4](https://github.com/instana/nodejs/commit/0900ab4e040822d17a2af6610fe7623846fd6128))

## [2.18.1](https://github.com/instana/nodejs/compare/v2.18.0...v2.18.1) (2023-03-06)

**Note:** Version bump only for package @instana/aws-lambda

# [2.18.0](https://github.com/instana/nodejs/compare/v2.17.0...v2.18.0) (2023-02-28)

**Note:** Version bump only for package @instana/aws-lambda

# [2.17.0](https://github.com/instana/nodejs/compare/v2.16.0...v2.17.0) (2023-02-20)

**Note:** Version bump only for package @instana/aws-lambda

# [2.16.0](https://github.com/instana/nodejs/compare/v2.15.0...v2.16.0) (2023-02-13)

**Note:** Version bump only for package @instana/aws-lambda

# [2.15.0](https://github.com/instana/nodejs/compare/v2.14.2...v2.15.0) (2023-01-27)

**Note:** Version bump only for package @instana/aws-lambda

## [2.14.2](https://github.com/instana/nodejs/compare/v2.14.1...v2.14.2) (2023-01-16)

### Bug Fixes

- **aws-lambda:** respect INSTANA_LOG_LEVEL ([#681](https://github.com/instana/nodejs/issues/681)) ([8c00a0c](https://github.com/instana/nodejs/commit/8c00a0cf905d0c21fb56d10496087a8a07599b51))

## [2.14.1](https://github.com/instana/nodejs/compare/v2.14.0...v2.14.1) (2023-01-12)

**Note:** Version bump only for package @instana/aws-lambda

# [2.14.0](https://github.com/instana/nodejs/compare/v2.13.2...v2.14.0) (2023-01-02)

**Note:** Version bump only for package @instana/aws-lambda

## [2.13.2](https://github.com/instana/nodejs/compare/v2.13.1...v2.13.2) (2022-12-14)

### Bug Fixes

- **aws-lambda:** reduced deadlocks and long running lambda executions ([#666](https://github.com/instana/nodejs/issues/666)) ([6800be0](https://github.com/instana/nodejs/commit/6800be01d32989723799894dd75a834f2c6c3f30))

## [2.13.1](https://github.com/instana/nodejs/compare/v2.13.0...v2.13.1) (2022-12-12)

**Note:** Version bump only for package @instana/aws-lambda

# [2.13.0](https://github.com/instana/nodejs/compare/v2.12.0...v2.13.0) (2022-12-07)

### Features

- **aws-lambda:** added the RequestId to most of the extension logs ([#660](https://github.com/instana/nodejs/issues/660)) ([469f131](https://github.com/instana/nodejs/commit/469f13195350d8e49952b9d7cec35ba71aaec428))

# [2.12.0](https://github.com/instana/nodejs/compare/v2.11.1...v2.12.0) (2022-11-22)

### Features

- **aws-lambda:** added support for ES modules ([#653](https://github.com/instana/nodejs/issues/653)) ([75c28a9](https://github.com/instana/nodejs/commit/75c28a92fb68f3d982207b545a211b65dc4d95ce))

## [2.11.1](https://github.com/instana/nodejs/compare/v2.11.0...v2.11.1) (2022-11-09)

**Note:** Version bump only for package @instana/aws-lambda

# [2.11.0](https://github.com/instana/nodejs/compare/v2.10.0...v2.11.0) (2022-11-04)

### Bug Fixes

- **serverless:** do not send x-instana-time header ([7ce7673](https://github.com/instana/nodejs/commit/7ce7673a514069b47c5b883faa9d86bc240244b6))

# [2.10.0](https://github.com/instana/nodejs/compare/v2.9.0...v2.10.0) (2022-10-06)

**Note:** Version bump only for package @instana/aws-lambda

# [2.9.0](https://github.com/instana/nodejs/compare/v2.8.1...v2.9.0) (2022-09-26)

### Features

- **aws-lambda:** added heartbeat to reduce timeouts ([#612](https://github.com/instana/nodejs/issues/612)) ([79ec77f](https://github.com/instana/nodejs/commit/79ec77f41e13688a3347a6a88a6d87839212cabd))

## [2.8.1](https://github.com/instana/nodejs/compare/v2.8.0...v2.8.1) (2022-09-21)

**Note:** Version bump only for package @instana/aws-lambda

# [2.8.0](https://github.com/instana/nodejs/compare/v2.7.1...v2.8.0) (2022-09-20)

### Bug Fixes

- **aws-lambda:** reduced backend retries & timeout ([#611](https://github.com/instana/nodejs/issues/611)) ([cab67dd](https://github.com/instana/nodejs/commit/cab67dd10b0f0b7ccfce2787b95e5a020d831cff))

## [2.7.1](https://github.com/instana/nodejs/compare/v2.7.0...v2.7.1) (2022-09-05)

**Note:** Version bump only for package @instana/aws-lambda

# 2.7.0 (2022-08-31)

### Features

- **aws-lambda:** added support for arm64 architecture ([#605](https://github.com/instana/nodejs/issues/605)) ([03dd47a](https://github.com/instana/nodejs/commit/03dd47a76d894310ce93063f4e26fd1e667be655)), closes [#596](https://github.com/instana/nodejs/issues/596)

## 2.6.2 (2022-08-17)

**Note:** Version bump only for package @instana/aws-lambda

## [2.6.1](https://github.com/instana/nodejs/compare/v2.6.0...v2.6.1) (2022-08-09)

### Bug Fixes

- **lambda:** interprete deadlineMs as absolute timestamp ([3326e67](https://github.com/instana/nodejs/commit/3326e6768aa962d7514eed314dd1c0a66612e69f))

# [2.6.0](https://github.com/instana/nodejs/compare/v2.5.0...v2.6.0) (2022-06-28)

### Features

- **aws-lambda:** added support for Node v16 ([718cf9f](https://github.com/instana/nodejs/commit/718cf9f69de3062964a28390900dc3f158557cdf))

# [2.5.0](https://github.com/instana/nodejs/compare/v2.4.0...v2.5.0) (2022-06-23)

### Bug Fixes

- **aws-lambda:** handle timeout error handling better ([#563](https://github.com/instana/nodejs/issues/563)) ([c2dbe77](https://github.com/instana/nodejs/commit/c2dbe7761f62b3c4b7c0cd9ba5cc0d5757d161c1))

# [2.4.0](https://github.com/instana/nodejs/compare/v2.3.0...v2.4.0) (2022-05-25)

**Note:** Version bump only for package @instana/aws-lambda

# [2.3.0](https://github.com/instana/nodejs/compare/v2.2.0...v2.3.0) (2022-05-24)

**Note:** Version bump only for package @instana/aws-lambda

# [2.2.0](https://github.com/instana/nodejs/compare/v2.1.0...v2.2.0) (2022-05-18)

**Note:** Version bump only for package @instana/aws-lambda

# [2.1.0](https://github.com/instana/nodejs/compare/v2.0.0...v2.1.0) (2022-04-28)

**Note:** Version bump only for package @instana/aws-lambda

# [2.0.0](https://github.com/instana/nodejs/compare/v1.140.1...v2.0.0) (2022-04-04)

### Bug Fixes

- **lambda:** remove nodejs8.10 from compatible runtimes ([ff945c2](https://github.com/instana/nodejs/commit/ff945c228e5361227bdae50ff48cc96b64c6b08c))
- dropped Node 6/8 ([0e6fd0e](https://github.com/instana/nodejs/commit/0e6fd0ef8f836ef6f2d95f3ddda2a641d92d0f86))
- remove npm package instana-nodejs-sensor ([5fb9f18](https://github.com/instana/nodejs/commit/5fb9f1807998fb3335652d135eb167dc13f9221d))
- self-disable if detected Node.js runtime version is too old ([cfe4248](https://github.com/instana/nodejs/commit/cfe4248a9a107165f8e96dbcb1948b399527d244))

### BREAKING CHANGES

- **lambda:** The Instana Node.js Lambda layer is no longer compatible with
  Node.js 8. For Lambda functions still running on Node.js 8, please use the
  latest layer version that has been published for Node.js 8, see
  https://www.ibm.com/docs/en/obi/current?topic=kinesis-aws-lambda-native-tracing-nodejs
- Starting with version 2.0.0, consumers of the package who
  still use the deprecated package name instana-nodejs-sensor will need to follow
  https://www.ibm.com/docs/en/obi/current?topic=nodejs-collector-installation#change-of-package-name
  to receive updates in the future.
- v2 has dropped support for Node 6/8.

## [1.140.1](https://github.com/instana/nodejs/compare/v1.140.0...v1.140.1) (2022-04-04)

**Note:** Version bump only for package @instana/aws-lambda

# [1.140.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.140.0) (2022-03-24)

**Note:** Version bump only for package @instana/aws-lambda

# [1.139.0](https://github.com/instana/nodejs/compare/v1.138.0...v1.139.0) (2022-03-09)

**Note:** Version bump only for package @instana/aws-lambda

# [1.138.0](https://github.com/instana/nodejs/compare/v1.137.5...v1.138.0) (2022-02-08)

### Features

- **aws-lambda:** added support for SSM parameter store ([#464](https://github.com/instana/nodejs/issues/464)) ([bdb6e68](https://github.com/instana/nodejs/commit/bdb6e68b821e45445752d351e3575c6b0d7f1da7))

## [1.137.5](https://github.com/instana/nodejs/compare/v1.137.4...v1.137.5) (2022-01-25)

**Note:** Version bump only for package @instana/aws-lambda

## [1.137.4](https://github.com/instana/nodejs/compare/v1.137.3...v1.137.4) (2022-01-11)

### Bug Fixes

- **aws-lambda:** fixed lambda timeouts when using extension ([#455](https://github.com/instana/nodejs/issues/455)) ([6df5550](https://github.com/instana/nodejs/commit/6df5550e59ab667a1eda5a01d911554e3dc17aee))
- **aws-lambda:** reduced lambda timeout error count when using extension [#443](https://github.com/instana/nodejs/issues/443) ([0bbfeb8](https://github.com/instana/nodejs/commit/0bbfeb8af57a381c5186624cbf5a19ead11ffe61))

## [1.137.3](https://github.com/instana/nodejs/compare/v1.137.2...v1.137.3) (2021-12-16)

**Note:** Version bump only for package @instana/aws-lambda

## [1.137.2](https://github.com/instana/nodejs/compare/v1.137.1...v1.137.2) (2021-11-30)

**Note:** Version bump only for package @instana/aws-lambda

## [1.137.1](https://github.com/instana/nodejs/compare/v1.137.0...v1.137.1) (2021-11-23)

**Note:** Version bump only for package @instana/aws-lambda
