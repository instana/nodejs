# Contributing

## Requirements

You should use the Node.js version defined in [.nvmrc](https://github.com/instana/nodejs/blob/main/.nvmrc) (and the `npm` version that comes with that Node.js version) for local development. You might want to install [nvm](https://github.com/nvm-sh/nvm) to manage multiple Node.js versions, but this is optional.

Python3 (< 3.11) is required, otherwise the db2 package won't build, see https://github.com/nodejs/node-gyp/issues/2219.

`brew install jq` for OSX (for other systems please look up [here](https://stedolan.github.io/jq/)) is required to run `npm run audit` or `lerna audit run`.

Note: You might need to install `libpq-dev`/`postgresql-devel` or a similar package before running `npm install` because `pg-native` depends on it. (`@instana/collector` and friends do not depend on `pg-native` but our test suite depends on it.)

After cloning the repository, run `npm install` in the root of the repository. This will install `lerna` as a local dependency and also bootstrap all packages (by running `npm install` in the individual packages, `packages/core`, `packages/collector`, ...). It is necessary to install `lerna` globally in order to perform lerna commands straight from the command line `npm install -g lerna`.

Make sure that your IDE is parsing .prettierrc. Otherwise, install the necessary plugins to make it so.

Troubleshooting `pg_config: command not found`: The tests in this package depend on (among others) `pg-native` and that in turn depends on the native add-on `libpq`. That add-on might try to call `pg_config` during `npm install`. If `npm install` terminates with `pg_config: command not found`, install the PostgreSQL package for your system (e.g. `brew install postgresql` or similar). If you do not want to run any tests, you can also omit this step and install dependencies with `npm install --production` instead.

Install the [`aws-cli`](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) to publish AWS layers from local.

## Executing Tests Locally

Some of the tests require infrastructure components (databases etc.) to run locally. The easiest way to run all required components locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). Start the script `bin/start-test-containers.sh` to set up all the necessary infrastructure. Once this is up, leave it running and, in second shell, start `bin/run-tests.sh`. This will set the necessary environment variables and kick off the tests.

If you want to see the Node.js collector's debug output while running the tests, make sure the environment variable `WITH_STDOUT` is set to a non-empty string. You can also use `npm run test:debug` instead of `npm test` to achieve this.

## Adding Tests

### ES6

We have added a CI build to test our instrumentations against ES module apps.
See https://github.com/instana/nodejs/pull/672

Not all of the current test apps have an `app.mjs` variant, because the effort is high. If you are adding a new test, please consider to also generate an `app.mjs` file for it. If you are modifying an existing application under test, and it has an accompanying `.mjs` file, you need to update that as well (by regenerating it).

You can use the script `bin/convert-test-app-to-es6.sh` for both purposes, it generates an equivalent `app.mjs` file from a given `app.js` file. For example, run `bin/convert-test-app-to-es6.sh packages/collector/test/tracing/database/ioredis/app.js` to regenerate the ES6 variant of the `ioredis` test application, when you have made changes to `packages/collector/test/tracing/database/ioredis/app.js`.

After regenerating an existing `app.mjs` file you should check the diff for it and potentially revert any changes that are artifacts of the conversion process, not related to your original changes in `app.js`.

Setting `RUN_ESM=true` locally will run use the ESM app instead of the CJS app when executing the tests.

## Executing code coverage tool

If you are actively developing a feature and you would like to know which lines and files you have already covered in your tests, it's recommended to use `.only` for the target test file and then run:

```
npm run coverage --scope @instana/collector
```

At the end of the execution it will open the coverage report in the browser and you can navigate through
the result.

Circle CI executes `npm run coverage-all` once per week to generate a full coverage report.
It's not recommended to run `coverage-all` locally, because it can take up to 1 1/2h.

## How to Contribute

This is an open source project, and we appreciate your help!

In order to clarify the intellectual property license granted with contributions from any person or entity, a Contributor License Agreement ("CLA") must be on file that has been signed by each contributor, indicating agreement to the license terms below. This license is for your protection as a contributor as well as the protection of Instana and its customers; it does not change your rights to use your own contributions for any other purpose.

Please print, fill out, and sign the [contributor license agreement](https://github.com/instana/nodejs/raw/main/misc/instana-nodejs-cla-individual.pdf). Once completed, please scan the document as a PDF file and email to the following email address: bastian.krol@instana.com.

Thank you for your interest in the Instana Node.js project!

## Managing Dependencies In Packages

Note: Development dependencies that are shared between multiple packages can be added to the root `package.json` file to speed up `npm install`. A dependency that is only used in one package can also be added to that particular `package.json` file.

Production dependencies that are required by a package always need to be added to that particular package directly. Dependencies from the root package.json are never part of the individual packages when they are uploaded to the npm registry, hence they would also not be installed for projects that depend on any `@instana` package. Thus, the root `package.json` file only has `devDependencies` and no `dependencies`.

The following sections describe how to manage dependencies in practice.

### package-lock.json

Note: The `package-lock.json` files are only relevant when you execute an `npm install` in _this repository_. Users of `@instana` npm packages will have their own `package-lock.json` or `yarn.lock` file for their application, those are completely independent from the `package-lock.json` files in this repository. Thus, they need to take care of updating their transitive dependencies themselves. We only can make sure that the version ranges we use for our direct dependencies (in our `package.json` files) allow to install a dependency tree that has no known vulnerabilities.

#### lockfileVersion

We currently use lockfileVersion 2. LockfileVersion 3 is no longer compatible with Node v10.
As soon as we drop Node v10, we can move to version 3.

Refs:
    - https://docs.npmjs.com/cli/v9/configuring-npm/package-lock-json#lockfileversion
    - https://github.com/instana/nodejs/pull/710

### Root Dependencies

To add or remove dependencies to/from the *root* `package.json`, you can execute plain vanilla `npm install -D ${dependeny-name}` or `npm uninstall ${dependeny-name}` commands in the root directory of the repository.

### Adding A Package Dependency

Do *not* run `npm install ${dependency-name}` in the directory of a package (like, in `packages/core`). This will mess up the `package-lock.json` file in that package. (If you accidentally did this, you can do a `git checkout` of the `package.json` file of the package and then run `npm run refresh-package-lock-files` to fix the lock file and the content of `node_modules`.)

The correct way of *adding* a dependency in one of the packages is to use the command `lerna add --scope=${package-name} ${dependency-name}`. For example, to add the dependency `moment` to the package `@instana/core`, you would use `lerna add --scope=@instana/core moment`. Specific versions or version ranges can be used as well: `lerna add --scope=@instana/core "moment@^2.29.1`. To add a development dependency, use `--dev`, that is, `lerna add --scope=@instana/collector --dev moment`. Refer to `lerna add --help` for more information.

### Updating Dependencies

#### Updating All Dependencies At Once

You can run `npm run update-deps` to update all dependencies in all packages via [`npm-check-updates`](https://www.npmjs.com/package/npm-check-updates) in one batch.

#### Updating A Single Version In A `package.json` File

Run `lerna add --scope=@instana/$package $dependencyName@$version && npm run refresh-package-lock-files`. For example, when you want to update the `semver` dependency in `@instana/core` to version 7.5.3, run `lerna add --scope=@instana/core semver@7.5.3 && npm run refresh-package-lock-files`.

You can manage dev dependencies in the same way, that is `lerna add --dev --scope=@instana/autoprofile semver@7.5.3 && npm run refresh-package-lock-files`.

Do *not* run `npm install ${dependency-name}` in the directory of a package (like, in `packages/core`) to update a dependency. This will mess up the `package-lock.json` file in that package. (If you accidentally did this, you can do a `git checkout` of the `package.json` file of the package and then run `npm run refresh-package-lock-files` to fix the lock file and the content of `node_modules`.)

#### Updating A Single Version In A Lockfile

You can also force an update of a specfic transitive dependency that is present in a package's `package-lock.json` file as follows. This is particularly useful to adress security vulnerabilities reported against transitive dependencies. For example, to update the transitive `minimist` dependency in `@instana/shared-metrics` to version `1.2.6`, do the following:

```
# Add the transitive dependency in the desired version temporarily as a direct dependency:
lerna add --scope=@instana/shared-metrics minimist@1.2.6

# This adds minimist as a direct dependency to shared-metric's package.json file, which is an undesired side-effect for
# our use case. To fix that, _remove_ minimist from packages/shared-metrics/package.json#dependencies again, then run:
npm run refresh-package-lock-files

# Finally, check that the dependency in question has been updated in `packages/shared-metrics/package-lock.json` to the desired version.
```

Note: The intent of the procedure above is satisfy security scanners (`npm audit`, Dependabot etc.) we run ourselves. The `package-lock.json` files are never included when publishing to the npm registry, see section <#package-lock.json>.

### Removing A Package Dependency

Do *not* run `npm uninstall ${dependency-name}` in the directory of a package. This will mess up the `package-lock.json` file in that package.

There is no `lerna` command to remove a dependency, that is, there is no `lerna remove --scope` counterpart for `lerna add --scope`. To remove a dependency from a package, remove the corresponding entry from the `dependencies`/`devDependencies`/... section of the package's `package.json` file and then run `npm run refresh-package-lock-files` afterwards. This will remove the package from the `node_modules` folder and also update the `package-lock.json` file correctly.

#### Version Ranges vs. Pinning a Specific Version

When adding new production dependencies, there is always the choice to either:
* add the dependency with a version _range_, e.g. list it as `"package-name": "~x.y.z"` or `"package-name": "^x.y.z"` in the `package.json` file, or
* _pin_ an exact version, that is, add it as `"package-name": "x.y.z"` to `package.json`.

Since we maintain packages that are used as _libraries_ by others (in contrast to maintaining an _application_ that we run ourselves), we should usually allow a version range of type `^` for all dependencies, unless there are very specific reasons not to. A `^` version range of `^1.2.3` matches all versions of `>= 1.2.3` and `< 2.0.0`, that is, it allows newer patch and minor versions, but no newer major version. This allows users of `@instana/collector` and other `@instana/...` packages  to update any transitive dependency these packages have on their own, without depending on IBM to release a new version of these packages. This is particularly relevant when transitive dependencies get flagged by vulnerability scanners. Nevertheless, we also always update depdencies when they get flagged by `npm audit` in a timely manner.

Possible reasons to pin an exact version of a dependency:
* We are using internals of the library (monkey-patching functions, depending on internal APIs etc.)
* The library had a history of introducing breaking changes in a semver-minor or semver-patch update. That is, we don't trust the maintainers to handle semver correctly.

These rules apply first and foremost to production dependencies (that is, `dependencies` and `optionalDependencies`, not as strictly for `devDependencies`). Still, for `devDependencies`, we usually should use `^` version ranges as well.

A note on `package-lock.json` files: Packages published on the npm registry never contain `package-lock.json` files. So the versions pinned in our `package-lock.json` files are only relevant to determine the package versions that get installed when running `npm install` inside this repository (locally or on CI), they do not affect users installing `@instana` packages as a dependency.



## Adding A New Package

When adding a new package to this monorepo, there are a few things to consider.

### CircleCI Caching

Reminder for all new packages: Check if `.circleci/config.yml` has `save_cache`/`restore_cache` entries for the new package.

### Package.json

For all new packages, make sure that a handful of npm scripts are part of package.json.
These scripts can be used by lerna, specially during CI builds:

```javascript
"scripts": {
    "audit": "npm audit --production",
    "test": "NODE_ENV=debug mocha --sort $(find test -iname '*test.js' -not -path '*node_modules*')",
    "test:debug": "WITH_STDOUT=true npm run test",
    "test:ci": "echo \"******* Files to be tested:\n $CI_CORE_TEST_FILES\" && if [ -z \"${CI_CORE_TEST_FILES}\" ]; then echo \"No test files have been assigned to this CircleCI executor.\"; else mocha --reporter mocha-multi-reporters --reporter-options configFile=reporter-config.json --require test/hooks.js --sort ${CI_CORE_TEST_FILES}; fi",
    "lint": "eslint src test",
    "verify": "npm run lint && npm test",
    "prettier": "prettier --write 'src/**/*.js' 'test/**/*.js'"
}
```

This also means, of course, that you will need to add the corresponding libraries to run these scripts:

 * lint
 * prettier
 * mocha (which you may have already installed in order to run unit/integration tests)

> If the new package has internal dependencies to one or more sibling packages (eg: @instana/core), the `audit` script should be replaced by:
>
> ```bin/prepare-audit.sh && npm audit --production; AUDIT_RESULT=$?; git checkout package-lock.json; exit $AUDIT_RESULT```
>
> Additionally, the corresponding `bin/prepare-audit.sh` (see more info below) must be created in the root of the new package, and the sibling packages must be marked to be

### Set Publishing Access For The New Package

After the package has been published to the npm registry for the first time, visit https://www.npmjs.com/package/@instana/${package-name}/access and set publishing access to "Require two-factor authentication or automation tokens". (The default setting is "Two-factor authentication is not required".)

### Lerna and `npm audit`

The Node.js tracer is structured in a monorepo.
That's how we manage to publish multiple packages in the `@instana/package` fashion, and for that we use [lerna](https://www.npmjs.com/package/lerna).

Among other things, lerna manages the dependency between internal packages in the root project.
When a package depends on another internal package (eg: `@instana/collector` depends on `@instana/core`), its package-lock.json does **not** have a reference
to the dependent package. This information lies in the package-lock.json of the root project, controlled by lerna.

However, in cases where there is this dependency between sibling packages, the `npm audit` command will fail when run in that particular package.
That's because `npm audit` won't find the dependency in the package-lock.json file, since this dependency lies in the package-lock.json of the root project only.

To work around this issue, we make use of a small shell script that temporarily adds the missing dependencies to package-lock.json, so `npm audit` can work as intended.
Then, the package-lock.json is reverted to its original state.

This script must be created in the package that depends on its sibling. By convention, we create the file in the root folder of the new package under `bin/prepare-audit.sh`.
Its contents must look like this:

```bash
set -eo pipefail

cd `dirname $BASH_SOURCE`/..
# Imports the function that changes package-lock.json temporarily
source ../../bin/add-to-package-lock
# Calls the function adding whatever internal package the package depends on
# In the exmaple below, it adds a dependency to @instana/serverless to the package-lock.json
# You can add as many lines as you need
addToPackageLock package-lock.json @instana/serverless false
```

Later on, the original package-lock.json is restored when `git checkout package-lock.json;` is run from the `audit` npm script that you added before (see the package.json section above)


## Release Process

### Publishing A New Release

To make a release, you first need to ensure that the released version will either be a semver _minor_ or _patch_ release, so that automatic updates are working for our users. Major releases require a different workflow, see [below](#publishing-a-pre-release). A major release would occur when the list of commits since the last release contains breaking changes, that is, commits with a commit comment with a footer starting with `"BREAKING CHANGE:"` (see https://www.conventionalcommits.org/en/v1.0.0/#specification for details).

The process to publish a new minor or patch release (that is, new versions of all packages) is as follows:

- Go to <https://github.com/instana/nodejs/actions/workflows/release.yaml>
- click on the "Run workflow" dropdown
- you do not need to change any settings (dry run etc.) the default values are fine
- click on the "Run workflow" button to trigger the action

The Github action will try to publish new versions for all packages from the most recent commit of the `main` branch. It will check if there is at least one successful CircleCI build for that commit hash for the main `build` workflow as well as for the `other-nodejs-versions` workflow. If that check fails, the Github action will abort. Otherwise it will go on to publish new releases to npm accordingly.

Parameters for the release Github action:
* "Use lerna publish from-package": Instead of executing `lerna publish`, the action will execute `lerna publish from-package`. See [below](#separate-lerna-version-and-lerna-publish) for the use case for this parameter. If in doubt, leave it unchanged (that is, `false`).
* "Dry Run": With this option set to true, the Github action will not actually create a release but only apply all changes (package.json and package-lock.json files, CHANGELOG files). The action log will show the resulting diff at the end. The changes will not be committed. This can be used to preview the changes the release action would apply. If this option is `true`, the option "Use lerna publish from-package" has no effect.
* "Skip CI status check": With this option set to true, the Github action will skip the preliminary check for successful CircleCI builds. This option should only be used for test purposes together with "Dry Run", or if actual lives depend on us publishing a release _right now_, without waiting for CircleCI.

Lerna will determine if this is going to be a minor or patch version from the commit comments of all commits since the last release. It will also automatically update the CHANGELOG.md files in the root of the repository and also in all individual packages, based on those commits.

If you want to locally review the changes that lerna is about to apply (for example the CHANGELOG files), you can execute `lerna version --no-git-tag-version --no-push` locally beforehand, inspect the diff, and discard the changes afterwards. You can also use the dry run option (see above).

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
NPM_CONFIG_OTP={your token} lerna publish --conventional-prerelease --dist-tag next --preid rc
```

This assumes that you are on a branch where the versions in all package.json files have already been bumped to `x.0.0` with `x` being the next major version.

#### Publishing A Major Release When A Pre-Release Exists

Doing a stable release after a prerelease requires you to use:

```
NPM_CONFIG_OTP={TOKEN} lerna publish --force-publish --conventional-graduate && lerna bootstrap
```

NOTE: With each prerelease the changelogs are getting updated. It might be wishful to delete the changelog before doing a final major release.

## Adding support for a new Node.js version

Example PR Node v18
https://github.com/instana/nodejs/pull/529

### Native dependencies (prebuilds)

We deliver prebuilds of native dependencies for every supported Node version in our releases.

You can find the ABI (NODE_MODULE_VERSION) [here](https://nodejs.org/en/download/releases/).

#### shared-metrics package

Please run these commands to generate the prebuilds for event-loop-stats and gcstats:

```sh
cd native-dep-packs
./rebuild-precompiled-addons.sh
BUILD_FOR_MACOS=true ./rebuild-precompiled-addons.sh
```

#### autoprofile package

Please run these commands to generate the prebuilds for our own autoprofiler:

```sh
cd packages/autoprofile
precompile/build-all-addons.js
```

NOTE: It is recommended to comment out the ABI versions you don't want to generate/regenerate in the `build-all-addons` script. Alternatively, if you want to regenerate all builds that's fine too, but it takes longer.

## Support for Cloud Services

### Publishing local layer to AWS

To publish local layer to AWS with the AWS CLI, the CLI needs to have access to the IAM credentials.

Steps to follow

- Create an IAM user if you don't already have one with the required rights.
- Create `credentials` file on the following folder location, `~/.aws`
- Add below informations to the newly created `credentials` file. The access key and secret key can be obtained from the IAM user account.
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