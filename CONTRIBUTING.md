# Contributing

## Requirements

Please install [nvm](https://github.com/nvm-sh/nvm) to manage multiple Node.js versions. The current development version is defined in our [.nvmrc](https://github.com/instana/nodejs/blob/main/.nvmrc).

Python3 (< 3.11) is required, otherwise the db2 package won't build, see https://github.com/nodejs/node-gyp/issues/2219.
If you're having issues with distutils module, then double check the python3 version (python3 --version) and make sure that the version pointing to is < 3.12
The error can be something like: ModuleNotFoundError: No module named 'distutils'

`npm i lerna@8.1.8 -g`
We need lerna being installed globally, because we have some
package.json scripts, who rely on lerna e.g. `npm run reinstall-deps`.

`brew install jq` for OSX (for other systems please look up [here](https://stedolan.github.io/jq/)) is required to run `npm run audit` or `lerna audit run`.

Note: You might need to install `libpq-dev`/`postgresql-devel` or a similar package before running `npm install` because `pg-native` depends on it. (`@instana/collector` and friends do not depend on `pg-native` but our test suite depends on it.)

After cloning the repository, run `npm install` in the root of the repository.

Ensure that your IDE is set up to utilize **ESLint** and **Prettier**, with automatic code formatting enabled.

Troubleshooting `pg_config: command not found`: The tests in this package depend on (among others) `pg-native` and that in turn depends on the native add-on `libpq`. That add-on might try to call `pg_config` during `npm install`. If `npm install` terminates with `pg_config: command not found`, install the PostgreSQL package for your system (e.g. `brew install postgresql` or similar). If you do not want to run any tests, you can also omit this step and install dependencies with `npm install --production` instead.

Install the [`aws-cli`](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) to publish AWS layers from local.

## Executing Tests Locally

Some of the tests require infrastructure components (databases etc.) to run locally. The easiest way to run required components locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). 

```sh
node bin/start-test-containers.js --mongo --redis
```

### Using terminal aliases

Add aliases to your terminal:

```sh
node bin/add-test-aliases.js bash|zsh
```

Add a mocha `.only` on the test you would like to execute and then run the target scope:

```sh
runcollector        # Run the 'collector' scope with watch mode
runcollector-nw     # Run the 'collector' scope without watch mode
```

### Manually

```sh
bin/run-tests.sh --scope=@instana/collector
bin/run-tests.sh --scope=@instana/collector --watch
```

If you want to see the Node.js collector's debug output while running the tests, make sure the environment variable `WITH_STDOUT` is set to a non-empty string.

## Adding Tests

### ES6

We have added a CI build to test our instrumentations against ES module apps.
See https://github.com/instana/nodejs/pull/672

Not all of the current test apps have an `.mjs` variant, because the effort is high. If you are adding a new test, please consider to also generate an `.mjs` file for it. If you are modifying an existing application under test, and it has an accompanying `.mjs` file, you need to update that as well (by regenerating it).

You can use the script `bin/convert-test-app-to-es6.sh` for both purposes, it generates an equivalent `.mjs` file from a given `.js` file. 

For example, run `bin/convert-test-app-to-es6.sh packages/collector/test/tracing/databases/ioredis/app.js` to regenerate the ES6 variant of the `ioredis` test application, when you have made changes to `packages/collector/test/tracing/databases/ioredis/app.js`.

After regenerating an existing `.mjs` file you should check the diff for it and potentially revert any changes that are artifacts of the conversion process, not related to your original changes in `.js` file.

If you add ESM support to a test directory, you have to transform **all** existing CJS apps to ESM apps.

Example: Consider a directory containing the following files, each representing a different application with a unique use case:

 - sender.js
 - app.js
 - rootExitSpanApp.js
 
If you add an ESM application for `sender.js`, you must also ensure that equivalent `.mjs` ESM applications exist for `app.js` and `rootExitSpanApp.js`.
See https://github.com/instana/nodejs/pull/1561.

Suppose in this case, if `rootExitSpanApp.mjs` is not added, the ESM test execution will default to running `rootExitSpanApp.js` alongside ESM unless the test is disabled for ESM. This can lead to timing issues due to differences in module loading between `.js` and `.mjs` files, potentially causing unintended span data.
See: https://github.com/instana/nodejs/pull/1602

There are two ways to specify which file to run as the server:

 - Explicit appPath – Provide the exact file name (appPath)
 - Using a dirname – Specify a directory instead (dirname)

If an appPath is provided, the ESM logic expects a file with the same name but with an `.mjs` extension.
Example: If appPath: `testApp1.js` is specified, then `testApp1.mjs` must be present in the same directory.

If a dirname is provided, the default app name is assumed to be `app.js`.
In this case, the ESM logic expects `app.mjs` to exist in the same directory.

Setting `RUN_ESM=true` locally will run use the ESM app instead of the CJS app when executing the tests.

## Executing code coverage tool

If you are actively developing a feature and you would like to know which lines and files you have already covered in your tests, you can run:

```
npm run coverage --npm_command="test:ci:opentelemetry-exporter"
```

At the end of the execution it will open the coverage report in the browser and you can navigate through
the result.

On Tekton we run `npm run coverage-ci` once per week to generate a full coverage report.

## How to Contribute

This is an open source project, and we appreciate your help!

Each source file must include this license header:

```
/*
 * (c) Copyright IBM Corp. 2024
 */
```

Furthermore you must include a sign-off statement in the commit message.

> Signed-off-by: John Doe <john.doe@example.com>

Thank you for your interest in the Instana Node.js project!

## Commit messages

We are adhering to the [Conventional Commits standard](https://www.conventionalcommits.org/en/v1.0.0/), which defines specific commit message types. The types we are using are: chore, build, docs, feat, fix, refactor, ci, or test.

For any change that is customer-facing and should appear in the changelog file, we require the use of either 'fix' or 'feat' in the commit message. If the change is not customer-facing and is more related to internal tasks or housekeeping, it should use 'chore' for instance. Please use 'fix' if you need to deprecate a library.

When composing commit messages, it's important to use past tense. Additionally, if there is a corresponding ticket or issue associated with the change, please put the ticket link in the commit message and pull request.

The commit message length is limited. Read through our commitlint rules [here](https://github.com/instana/nodejs/blob/v3.14.4/commitlint.config.js#L14).

For instance, you can refer to this example commit message: https://github.com/instana/nodejs/commit/bd3e7554fe21188c3ad10d442e4d72546d5c2267

## Creating a development branch

When creating a development branch, please follow these guidelines:

- Choose a branch name that is brief yet clearly indicates the purpose of the feature.
- Use lowercase alphanumeric characters (a-z, 0-9).
- Hyphens (-) can be used for separation, but cannot be the first or last character of the name.
- The name must begin and end with an alphanumeric character.
- You have to use one of the following prefixes: `fix-`, `feat-`, `chore-`, `docs-`, `test-`
- We are using the same prefix names as commit prefixes, see https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716
  - Those will be automatically deleted after 60 days.
  - We do not delete branches after merge.
  - Branches who do not use the prefix won't get cleaned up.
  
For example:

- Good branch names:
  - `feat-redis`
  - `fix-lambda-timeout`

- Avoid using:
  - `feat/redis`

## Managing Dependencies In Packages

We are using **npm workspaces** and **lerna v8**.

- https://lerna.js.org/docs/introduction
- https://docs.npmjs.com/cli/v7/using-npm/workspaces/

Development dependencies that are shared between multiple packages should be added to the root `package.json` file.

Production dependencies that are required by a package always need to be added to that particular package directly. Dependencies from the root package.json are never part of the individual packages when they are uploaded to the npm registry, hence they would also not be installed for projects that depend on any `@instana` package. Thus, the root `package.json` file only has `devDependencies` and no `dependencies`.

The following sections describe how to manage dependencies in practice.

### Adding A Package Dependency

`npm install -D ${dependency-name}`: Adds a dev dependency to the root `package.json` file.
`npm install ${dependency-name} -w packages/collector`: Adds a production dependency to the package `@instana/collector`. This is equivalent to `cd packages/collector; npm install ${dependency-name}`.
`npm install -D ${dependency-name} -w packages/collector`: Adds a dev dependency to the package `@instana/collector`. This is equivalent to `cd packages/collector; npm install -D ${dependency-name}`.

### Removing A Package Dependency

`npm uninstall ${dependency-name}`: Removes a dependency from the root package.
`npm uninstall ${dependency-name} -w packages/collector`: Removes a dependency from the package `@instana/collector`. This is equivalent to `cd packages/collector; npm uninstall ${dependency-name}`.

### Updating A Single Version In A `package.json` File

`npm install ${dependency-name}@${version}`: Updates a specific production dependency on the root.
`npm install -D ${dependency-name}@${version}`: Updates a specific dev dependency on the root.
`npm install ${dependency-name}@${version} -w packages/collector`: Updates a specific production dependency in the package `@instana/collector`. This is equivalent to `cd packages/collector; npm install ${dependency-name}@${version}`.
`npm install -D ${dependency-name}@${version} -w packages/collector`: Updates a specific dev dependency in the package `@instana/collector`. This is equivalent to `cd packages/collector; npm install -D ${dependency-name}@${version}`.

### Updating A Single Version In A Lockfile

`npm update ${dependency-name}`: Updates a specific production dependency on the root lock file.
`npm update -D ${dependency-name}`: Updates a specific dev dependency on the root lock file.
`npm update ${dependency-name} -w packages/collector`: Updates a specific production dependency of the package `@instana/collector`. This is equivalent to `cd packages/collector; npm update ${dependency-name}`.
`npm update -D ${dependency-name} -w packages/collector`: Updates a specific dev dependency of the package `@instana/collector`. This is equivalent to `cd packages/collector; npm update -D ${dependency-name}`.

### package-lock.json

There is only one single package-lock.json file when using **npm workspaces**.

We are currently using **lockfileVersion 3**.

If you need to recreate the package lock file, please us `npm i --lockfile-version 2`.

Refs:
    - https://docs.npmjs.com/cli/v9/configuring-npm/package-lock-json#lockfileversion
    - https://github.com/instana/nodejs/pull/710

**Note:** Packages published on the npm registry never contain `package-lock.json` files. So the versions pinned in our `package-lock.json` file are only relevant to determine the package versions that get installed when running `npm install` inside this repository (locally or on CI), they do not affect users installing `@instana` packages as a dependency.

### Version Ranges vs. Pinning a Specific Version

When adding new production dependencies, there is always the choice to either:
* add the dependency with a version _range_, e.g. list it as `"package-name": "~x.y.z"` or `"package-name": "^x.y.z"` in the `package.json` file, or
* _pin_ an exact version, that is, add it as `"package-name": "x.y.z"` to `package.json`.

Since we maintain packages that are used as _libraries_ by others (in contrast to maintaining an _application_ that we run ourselves), we should usually allow a version range of type `^` for all dependencies, unless there are very specific reasons not to. A `^` version range of `^1.2.3` matches all versions of `>= 1.2.3` and `< 2.0.0`, that is, it allows newer patch and minor versions, but no newer major version. This allows users of `@instana/collector` and other `@instana/...` packages  to update any transitive dependency these packages have on their own, without depending on IBM to release a new version of these packages. This is particularly relevant when transitive dependencies get flagged by vulnerability scanners. Nevertheless, we also always update dependencies when they get flagged by `npm audit` in a timely manner.

Possible reasons to pin an exact version of a dependency:
* We are using internals of the library (monkey-patching functions, depending on internal APIs etc.)
* The library had a history of introducing breaking changes in a semver-minor or semver-patch update. That is, we don't trust the maintainers to handle semver correctly.

These rules apply first and foremost to production dependencies (that is, `dependencies` and `optionalDependencies`, not as strictly for `devDependencies`). Still, for `devDependencies`, we usually should use `^` version ranges as well.

## Adding A New Package

When adding a new package to this monorepo, there are a few things to consider.

Example PR to add a new package:
https://github.com/instana/nodejs/pull/932

## Naming

Please choose a strong and meaningful name for the package. Discuss the name within the team.

### Set Publishing Access For The New Package

After the package has been published to the npm registry for the first time, visit https://www.npmjs.com/package/@instana/${package-name}/access and set publishing access to "Require two-factor authentication or automation tokens". (The default setting is "Two-factor authentication is not required".)

## Release Process

### Publishing A New Release

To make a release, you first need to ensure that the released version will either be a semver _minor_ or _patch_ release, so that automatic updates are working for our users. Major releases require a different workflow, see [below](#publishing-a-pre-release). A major release would occur when the list of commits since the last release contains breaking changes, that is, commits with a commit comment with a footer starting with `"BREAKING CHANGE:"` (see https://www.conventionalcommits.org/en/v1.0.0/#specification for details).

The process to publish a new minor or patch release (that is, new versions of all packages) is as follows:

- Go to <https://github.com/instana/nodejs/actions/workflows/release.yaml>
- click on the "Run workflow" dropdown
- you do not need to change any settings (dry run etc.) the default values are fine
- click on the "Run workflow" button to trigger the action

The Github action will try to publish new versions for all packages from the most recent commit of the `main` branch. 

Parameters for the release Github action:
* "Use lerna publish from-package": Instead of executing `lerna publish`, the action will execute `lerna publish from-package`. See [below](#separate-lerna-version-and-lerna-publish) for the use case for this parameter. If in doubt, leave it unchanged (that is, `false`).
* "Dry Run": With this option set to true, the Github action will not actually create a release but only apply all changes (package.json and package-lock.json files, CHANGELOG files). The action log will show the resulting diff at the end. The changes will not be committed. This can be used to preview the changes the release action would apply. If this option is `true`, the option "Use lerna publish from-package" has no effect.

Lerna will determine if this is going to be a minor or patch version from the commit comments of all commits since the last release. It will also automatically update the CHANGELOG.md files in the root of the repository and also in all individual packages, based on those commits.

If you want to locally review the changes that lerna is about to apply (for example the CHANGELOG files), you can execute `lerna version --no-git-tag-version --no-push --conventional-commits` locally beforehand, inspect the diff, and discard the changes afterwards. You can also use the dry run option (see above).

For each release, we also publishing a new Lambda layer, a Fargate Docker image layer and a Google Cloud Run image layer. This happens automatically via [CI](https://ci.instana.io/teams/nodejs/pipelines/serverless-in-process-collectors:main).

The Github action will send a Slack notification to the channel of team Node.js. Additionally, you can enable notifications for actions for your account at <https://github.com/settings/notifications> (in the section titled "Actions"). But enabling that might also get you notifications for other repositories you contribute to.

#### Separate lerna version And lerna publish

It is possible to execute the git parts of a release (version bump and tagging) and the npm part (publishing to the npm registry) separately. This can be used to rectify a situation when the `lerna publish` step of the [Github release action](#publishing-a-new-release) did not go through successfully and has only completed the git actions but not the npm publish, or only published a subset of the packages successfully.

- Run `lerna version` to bump all versions and create a git tag.
    - You can skip this step if it has already happened for the release you want to publish. If not, the step is mandatory.
    - Lerna will determine if this is going to be a major, minor or patch version from the commit comments of all commits since the last release. It will also update all relevant changelog files.
    - Lerna will push the commit and the tag created by `lerna version` to GitHub. Check that this has happened. Also check that the version numbers in package-lock.json have been updated as well.
- Run the Github action `release-on-demand` with the parameter `Use lerna publish from-package` set to `true`.

This will execute `lerna publish from-package`. This can also be used if the previous execution of the release Github action went through for a subset of packages but not for others. Lerna will automatically figure out for which packages the latest version is not present in the registry and only publish those.

#### Rate Limited OTP

If publishing the packages fails with an error like this:

```
lerna ERR! E429 Could not authenticate ${npm-user-name}: rate limited otp
```

you will need to wait five minutes before trying again. In case some packages have already been published and others have not, use the option "Use lerna publish from-package" as explained in the [previous section](#separate-lerna-version-and-lerna-publish).

#### Publishing A Pre-Release

To publish a pre-release for the next major version, execute:

```
NPM_CONFIG_OTP={your token} lerna publish --dist-tag next --preid rc
```

This assumes that you are on a branch where the versions in all package.json files have already been bumped to `x.0.0` with `x` being the next major version.

#### Publishing without Pre-Releases

To publish the next major version, execute:

```
NPM_CONFIG_OTP={TOKEN} lerna publish --no-verify-access --force-publish
```

#### Publishing A Major Release When A Pre-Release Exists

Doing a stable release after a prerelease requires you to use:

```
NPM_CONFIG_OTP={TOKEN} lerna publish --force-publish --conventional-graduate
```

NOTE: With each prerelease the changelogs are getting updated. It might be wishful to delete the changelog before doing a final major release.

## Adding support for a new Node.js version

Example PR Node v18
https://github.com/instana/nodejs/pull/529

### Native dependencies (prebuilds)

We deliver prebuilds of native dependencies for every supported Node version in our releases.

You can find the ABI (NODE_MODULE_VERSION) [here](https://nodejs.org/en/download/releases/).
They removed the ABI versions from this page. You can read it from [this link](https://github.com/nodejs/node/blob/main/doc/abi_version_registry.json) for now.

#### shared-metrics package

Please run these commands to generate the prebuilds for event-loop-stats and gcstats:

```sh
cd native-dep-packs
./rebuild-precompiled-addons.sh
BUILD_FOR_MACOS=true ./rebuild-precompiled-addons.sh
```

#### autoprofile package

Please read `packages/autoprofile/CONTRIBUTING.md`.

## Support for Cloud Services

### Publishing local layer to AWS

To publish local layer to AWS with the AWS CLI, the CLI needs to have access to the IAM credentials.

Steps to follow

- Create an IAM user if you don't already have one with the required rights.
- Create `credentials` file on the following folder location, `~/.aws`
- Add below information to the newly created `credentials` file. The access key and secret key can be obtained from the IAM user account.
```javascript
[default]
aws_access_key_id = <add your access key>
aws_secret_access_key = <add your secret key>
```
More information can be found [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).
- Run these commands to publish local layer to AWS:
```sh
cd packages/aws-lambda/layer/bin/
REGIONS=<region> SKIP_DOCKER_IMAGE=true BUILD_LAYER_WITH=local LAYER_NAME=experimental-instana-nodejs-with-extension ./publish-layer.sh
```
## ESM Support

We have added the ESM support for all Node.js versions, Since version 20.6, [ESM loaders are off-thread](https://github.com/nodejs/node/pull/44710), loaded separately, a shift from previous setups where the Instana collector was loaded within the loader, leading to a disruption in existing implementation. To resolve this, we've replaced the deprecated `--experimental-loader` with `--import`, facilitating the loading of the collector in the main thread. However, note that `--import` is only compatible with Node.js v18.19 and later, necessitating the maintenance of both styles for different Node.js versions.

Use the following command to enable experimental ESM support:

- For Node.js versions greater than or equal to 18.19:

```sh
node --import  /path/to/instana/node_modules/@instana/collector/esm-register.mjs entry-point
```
- For Node.js versions less than 18.19:

```sh
node --experimental-loader /path/to/instana/node_modules/@instana/collector/esm-loader.mjs entry-point
```

## Node.js prerelease

We have added support for a prerelease [pipeline on Tekton](https://cloud.ibm.com/devops/pipelines/tekton/c2cd6a8d-ea5a-47b0-913e-cd172d63833f?env_id=ibm:yp:eu-de).

We support [RC]("https://nodejs.org/download/rc") & [NIGHTLY]("https://nodejs.org/download/nightly") versions.

If you would like to test something against a prerelease locally, follow these instructions:

Set the NVM_NODEJS_ORG_MIRROR environment variable to the appropriate mirror (either rc or nightly).

```sh
NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/rc" nvm install 23.0.0
```

For nightly versions,

```sh
NVM_NODEJS_ORG_MIRROR="https://nodejs.org/download/nightly" nvm install 23.0.0
```

To revert back to stable versions, unset the environment variable NVM_NODEJS_ORG_MIRROR:

```sh
unset NVM_NODEJS_ORG_MIRROR
```
