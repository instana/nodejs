# Contributing

## Local Set Up
After cloning the repository, run `npm install` in the root of the repository. This will install `lerna` as a local dependency and run `lerna bootstrap` to initialize all packages (`packages/core`, `packages/collector`, ...). It can be convenient to have `lerna` installed globally to be able to run lerna commands directly from the command line, but it is not strictly necessary.

## Executing Tests locally
Some of the tests require infrastructure components (databases etc.) to run locally. The easiest way to run all required components locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). Start the script `bin/start-test-containers.sh` to set up all the necessary infrastructure. Once this is up, leave it running and, in second shell, start `bin/run-tests.sh`. This will set the necessary environment variables and kick off the tests.

If you want to see the Node.js collector's debug output while running the tests, make sure the environment variable `WITH_STDOUT` is set to a non-empty string. You can also use `npm run test:debug` instead of `npm test` to achieve this.

## Release Process

### Making a new release
To make a release, you first need to ensure that the released version will either be a semver minor or patch release so that automatic updates are working for our users. Following that, the process is simple:

- Update `CHANGELOG.md` so that the unreleased section gets its version number. Commit and push this change.
- Acquire an OTP token for 2fa.
- Run either
    - `NPM_CONFIG_OTP={your token} lerna publish --force-publish="*" patch`, or
    - `NPM_CONFIG_OTP={your token} lerna publish --force-publish="*" minor`.

After running this commands, the node_modules folder in the individual packages will have been pruned, so run `lerna bootstrap` afterwards.

#### Separate lerna version and lerna publish
You might want to separate the version bumping and tagging from publishing to the npm registry. This is also possible. The separate lerna publish command (see below) is also helpful if the publish did not go through successfully.

- Run `lerna version --force-publish="*" patch` or `lerna version --force-publish="*" minor`, depending on which part of the version number has to be bumped. We should never have the need to bump the major version, so do not run `lerna version major`.
- Lerna will push the commit and the tag created by `lerna version` to GitHub. Check that this has happened. Also check that the version numbers in package-lock.json have been updated as well.
- Acquire an OTP token for 2fa.
- `NPM_CONFIG_OTP={your token} lerna publish from-package`
