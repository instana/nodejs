# Contributing

## Local Set Up

After cloning the repository, run `npm install` in the root of the repository. This will install `lerna` as a local dependency and also bootstrap all packages (by running `npm install` in the individual packages, `packages/core`, `packages/collector`, ...). It can be convenient to have `lerna` installed globally to be able to run lerna commands directly from the command line, but it is not strictly necessary.

## Executing Tests Locally

Some of the tests require infrastructure components (databases etc.) to run locally. The easiest way to run all required components locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). Start the script `bin/start-test-containers.sh` to set up all the necessary infrastructure. Once this is up, leave it running and, in second shell, start `bin/run-tests.sh`. This will set the necessary environment variables and kick off the tests.

If you want to see the Node.js collector's debug output while running the tests, make sure the environment variable `WITH_STDOUT` is set to a non-empty string. You can also use `npm run test:debug` instead of `npm test` to achieve this.

## Release Process

### When Adding A New Package

Reminder for all new packages: Check if `.circleci/config.yml` has `save_cache`/`restore_cache` entries for the new package.

When adding a new _scoped_ package (that is, `@instana/something` in contrast to `instana-something`), it needs to be configured to have public access, because scoped packages are private by default. Thus the publish would fail with something like `npm ERR! You must sign up for private packages: @instana/something`. To prevent this, you can the configure access level beforehand globablly:

* Run `npm config list` and check if the global section (e.g. `/Users/$yourname/.npmrc`) contains `access = "public"`.
* If not, run `npm config set access public` and check again.
* Following that, all packages can be published as usual (see below).
* See also: https://github.com/lerna/lerna/issues/1821.
* Many roads lead to rome, you can also set the access level on a package level instead of globally. Or you can issue `lerna version` separately and then publish only the new package directly via `npm` from within its directory with `NPM_CONFIG_OTP={your token} npm publish --access public` before publishing all the remaining package from the root directory with `NPM_CONFIG_OTP={your token} lerna publish from-package && lerna bootstrap`. This is also the way to remedy a situation where some of the packages have been published and some have not been published because you forgot to take care of the new package beforehand and the aforementioned error stopped the `lerna publish` in the middle. See [here](#separate-lerna-version-and-lerna-publish).

### Making A New Release

To make a release, you first need to ensure that the released version will either be a semver minor or patch release so that automatic updates are working for our users. Following that, the process is simple:

- Update `CHANGELOG.md` so that the unreleased section gets its version number. Commit and push this change.
- Acquire an OTP token for 2fa.
- Run either
    - `NPM_CONFIG_OTP={your token} lerna publish --force-publish="*" patch && lerna bootstrap`, or
    - `NPM_CONFIG_OTP={your token} lerna publish --force-publish="*" minor && lerna bootstrap`.

For each package release, we also publishing a new Lambda layer and a Fargate Docker image layer. This happens automatically via CI.

#### Separate lerna version And lerna publish

You might want to separate the version bumping and tagging from publishing to the npm registry. This is also possible. The separate lerna publish command (see below) is also helpful if the publish did not go through successfully.

- Run `lerna version --force-publish="*" patch` or `lerna version --force-publish="*" minor`, depending on which part of the version number has to be bumped. We should never have the need to bump the major version, so do not run `lerna version major`.
- Lerna will push the commit and the tag created by `lerna version` to GitHub. Check that this has happened. Also check that the version numbers in package-lock.json have been updated as well.
- Acquire an OTP token for 2fa.
- `NPM_CONFIG_OTP={your token} lerna publish from-package && lerna bootstrap`

This command can also be run if the previous publish command went through for a subset of packages but not for others. Lerna will automatically figure out for which packages the latest version is not present in the registry and only publish those.
