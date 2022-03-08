# Contributing

## Requirements

We are currently using **Node.js v16** for local development.

`brew install jq` for OSX (for other systems please look up [here](https://stedolan.github.io/jq/)) is required to run `npm run audit` or `lerna audit run`.

Note: You might need to install `libpq-dev`/`postgresql-devel` or a similar package before running `npm install` because `pg-native` depends on it. (`@instana/collector` and friends do not depend on `pg-native` but our test suite depends on it.)

After cloning the repository, run `npm install` in the root of the repository. This will install `lerna` as a local dependency and also bootstrap all packages (by running `npm install` in the individual packages, `packages/core`, `packages/collector`, ...). It can be convenient to have `lerna` installed globally to be able to run lerna commands directly from the command line, but it is not strictly necessary.

Make sure that your IDE is parsing .prettierrc. Otherwise, install the necessary plugins to make it so.

Troubleshooting `pg_config: command not found`: The tests in this package depend on (among others) `pg-native` and that in turn depends on the native add-on `libpq`. That add-on might try to call `pg_config` during `npm install`. If `npm install` terminates with `pg_config: command not found`, install the PostgreSQL package for your system (e.g. `brew install postgresql` or similar). If you do not want to run any tests, you can also omit this step and install dependencies with `npm install --production` instead.

## Executing Tests Locally

Some of the tests require infrastructure components (databases etc.) to run locally. The easiest way to run all required components locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). Start the script `bin/start-test-containers.sh` to set up all the necessary infrastructure. Once this is up, leave it running and, in second shell, start `bin/run-tests.sh`. This will set the necessary environment variables and kick off the tests.

If you want to see the Node.js collector's debug output while running the tests, make sure the environment variable `WITH_STDOUT` is set to a non-empty string. You can also use `npm run test:debug` instead of `npm test` to achieve this.

## How to Contribute

This is an open source project, and we appreciate your help!

In order to clarify the intellectual property license granted with contributions from any person or entity, a Contributor License Agreement ("CLA") must be on file that has been signed by each contributor, indicating agreement to the license terms below. This license is for your protection as a contributor as well as the protection of Instana and its customers; it does not change your rights to use your own contributions for any other purpose.

Please print, fill out, and sign the [contributor license agreement](https://github.com/instana/nodejs/raw/main/misc/instana-nodejs-cla-individual.pdf). Once completed, please scan the document as a PDF file and email to the following email address: bastian.krol@instana.com.

Thank you for your interest in the Instana Node.js project!

## Managing Dependencies In Packages

Note: Development dependencies that are shared between multiple packages can be added to the root `package.json` file to speed up `npm install`. A dependency that is only used in one package can also be added to that particular `package.json` file.

Production dependencies that are required by a package always need to be added to that particular package directly. Dependencies from the root package.json are never part of the individual packages when they are uploaded to the npm registry, hence they would also not be installed for projects that depend on any `@instana` package. Thus, the root `package.json` file only has `devDependencies` and no `dependencies`.

The following sections describe how to manage dependencies in practice.

### Root Dependencies

To add or remove dependencies to/from the *root* `package.json`, you can execute plain vanilla `npm install -D ${dependeny-name}` or `npm uninstall ${dependeny-name}` commands in the root directory of the repository.

### Adding A Package Dependency

Do *not* run `npm install ${dependency-name}` in the directory of a package (like, in `packages/core`). This will mess up the `package-lock.json` file in that package. (If you accidentally did this, you can do a `git checkout` of the `package.json` file of the package and then run `npm run refresh-package-lock-files` to fix the lock file and the content of `node_modules`.)

The correct way of *adding* a dependency in one of the packages is to use the command `lerna add --scope=${package-name} ${dependency-name}`. For example, to add the dependency `moment` to the package `@instana/core`, you would use `lerna add --scope=@instana/core moment`. Specific versions or version ranges can be used as well: `lerna add --scope=@instana/core "moment@^2.29.1`. To add a development dependency, use `--dev`, that is, `lerna add --scope=@instana/collector --dev moment`. Refer to `lerna add --help` for more information.

### Removing A Package Dependency

Do *not* run `npm uninstall ${dependency-name}` in the directory of a package. This will mess up the `package-lock.json` file in that package.

There is no `lerna` command to remove a dependency, that is, there is no `lerna remove --scope` counterpart for `lerna add --scope`. To remove a dependency from a package, remove the corresponding entry from the `dependencies`/`devDependencies`/... section of the package's `package.json` file and then run `npm run refresh-package-lock-files` afterwards. This will remove the package from the `node_modules` folder and also update the `package-lock.json` file correctly.

### Updating Dependencies

#### Updating All Dependencies At Once

You can run `npm run update-deps` to update all dependencies in all packages via [`npm-check-updates`](https://www.npmjs.com/package/npm-check-updates) in one batch.

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

Note: The intent of the procedure above is satisfy security scanners (`npm audit`, Dependabot etc.). `package-lock.json` files are never included when publishing to the npm registry. Thy are only relevant when you execute an `npm install` in _this repository_. Users of `@instana` npm packages will have their own `package-lock.json` or `yarn.lock` file for their application, those are completely independent from the `package-lock.json` files in this repository. Thus, they need to take care of updating their transitive dependencies themselves. We only can make sure that the version ranges we use for our direct dependencies allow to install a dependency tree that has no known vulnerabilities.

## Release Process

### When Adding A New Package

Reminder for all new packages: Check if `.circleci/config.yml` has `save_cache`/`restore_cache` entries for the new package.

When adding a new _scoped_ package (that is, `@instana/something` in contrast to `instana-something`), it needs to be configured to have public access, because scoped packages are private by default. Thus the publish would fail with something like `npm ERR! You must sign up for private packages: @instana/something`. To prevent this, you can configure the access level beforehand globablly:

* Run `npm config list` and check if the global section (e.g. `/Users/$yourname/.npmrc`) contains `access = "public"`.
* If not, run `npm config set access public` and check again.
* Following that, all packages can be published as usual (see below).
* See also: https://github.com/lerna/lerna/issues/1821.
* Many roads lead to rome, you can also set the access level on a package level instead of globally. Or you can issue `lerna version` separately and then publish only the new package directly via `npm` from within its directory with `NPM_CONFIG_OTP={your token} npm publish --access public` before publishing all the remaining package from the root directory with `NPM_CONFIG_OTP={your token} lerna publish from-package && lerna bootstrap`. This is also the way to remedy a situation where some of the packages have been published and some have not been published because you forgot to take care of the new package beforehand and the aforementioned error stopped the `lerna publish` in the middle. See [here](#separate-lerna-version-and-lerna-publish).
* Add the relevant npm scripts to the `package.json` (see details below).

#### Package.json

For all new packages, make sure that a handful of npm scripts are part of package.json.
These scripts can be used by lerna, specially during CI builds:

```javascript
"scripts": {
    "audit": "npm audit --production",
    "test": "NODE_ENV=debug mocha --sort $(find test -iname '*test.js' -not -path '*node_modules*')",
    "test:debug": "WITH_STDOUT=true npm run test",
    "test:ci": "echo \"******* Files to be tested:\n $CI_CORE_TEST_FILES\" && if [ -z \"${CI_CORE_TEST_FILES}\" ]; then echo \"No Files to test in this node\"; else mocha --reporter mocha-multi-reporters --reporter-options configFile=reporter-config.json --sort ${CI_CORE_TEST_FILES}; fi",
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

#### Lerna and `npm audit`

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

### Making A New Release

To make a release, you first need to ensure that the released version will either be a semver minor or patch release so that automatic updates are working for our users. Following that, the process is simple:

- Acquire an OTP token for 2fa.
- Ensure you are logged in with npm in your shell (`npm whoami`)
- Run `NPM_CONFIG_OTP={your token} lerna publish && lerna bootstrap`.

Lerna will determine if this is going to be a major, minor or patch version from the commit comments of all commits since the last release. It will also automatically update the CHANGELOG.md files in the root of the repository and also in all individual packages, based on those commits.

If you want to review the changes that lerna is about to apply (for example the CHANGELOG files), you can execute `lerna version --no-git-tag-version --no-push` first.

For each package release, we also publishing a new Lambda layer and a Fargate Docker image layer. This happens automatically via CI.

#### Separate lerna version And lerna publish

You might want to separate the version bumping and tagging from publishing to the npm registry. This is also possible. The separate lerna publish command (see below) is also helpful if the publish did not go through successfully.

- Run `lerna version`.
- Lerna will determine if this is going to be a major, minor or patch version from the commit comments of all commits since the last release. It will also update all relevant changelog files.
- Lerna will push the commit and the tag created by `lerna version` to GitHub. Check that this has happened. Also check that the version numbers in package-lock.json have been updated as well.
- Acquire an OTP token for 2fa.
- `NPM_CONFIG_OTP={your token} lerna publish from-package && lerna bootstrap`

That last command (`lerna publish from-package`) can also be run if the previous publish command went through for a subset of packages but not for others. Lerna will automatically figure out for which packages the latest version is not present in the registry and only publish those.

Be aware that if `lerna version` or `lerna publish` abort with an error in the middle of doing things, you might end up with local changes in the `package.json` files. Lerna adds some metadata there just before trying to publish. These changes can simply be discarded with `git checkout packages` before trying to publish again.

#### Publishing a pre-release

To publish a pre-release for the next major version, execute:

```
NPM_CONFIG_OTP={your token} lerna publish --conventional-prerelease --dist-tag next --preid rc
```

This assumes that you are on a branch where the versions in all package.json files have already been bumped to `x.0.0` with `x` being the next major version.

#### Rate Limited OTP

If publishing the packages fails with an error like this:

```
lerna ERR! E429 Could not authenticate ${npm-user-name}: rate limited otp
```

you simply need to wait five minutes before trying again. In case some packages have already been published and others have not, refer the advice about `lerna publish from-package` in the previous section.

