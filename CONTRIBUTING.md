# Contributing

## Executing Tests locally
Some of the tests require infrastructure components (databases etc.) to run locally. The easiest way to run all required components locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). Start the script `bin/start-test-containers.sh` to set up all the necessary infrastructure. Once this is up, leave it running and, in second shell, start `bin/run-tests.sh`. This will set the necessary environment variables and kick off the tests.

If you want to see the Node.js sensor's debug output while running the tests, make sure the environment variable `WITH_STDOUT` is set to a non-empty string. You can also use `npm run test:debug` instead of `npm test` to achieve this.

## Release Process

### Making a new release
To make a release, you first need to ensure that the released version will either be a semver minor or patch release so that automatic updates are working for our users. Following that, the process is simple:

 - Update `CHANGELOG.md` so that the unreleased section gets its version number. Commit this change.
 - Run `npm version patch`, `npm version minor`, or `npm version major`, depending on which part of the version number has to be bumped.
 - Push the commit and the tag created by `npm version` to GitHub, e.g. `git push --tags origin master`.

### Pushing Artifacts to NPM
Once the released is properly commited and tagged, you can release the artifact to NPM in the following way:

```
# you will be prompted for a 2FA code/OTP (one time password).
npm publish
```
