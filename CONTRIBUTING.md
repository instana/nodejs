# Contributing

## Executing Tests locally
Some of the tests require databases to run locally. The easiest way to run these databases locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). Run the convenience script `run-tests-with-docker.sh` to set up all the necessary databases and environment variables and kick off the tests. The script also makes sure that the tests are running from a clean starting state.

## Release Process

### Making a new release
To make a release, you first need to ensure that the released version will either be a semver minor or patch release so that automatic updates are working for our users. Following that, the process is simple:

 - Update `CHANGELOG.md` so that the unreleased section gets its version number.
 - Update the version number in `package.json`.
 - Commit the new version, e.g. `git commit -m "1.28.0"`.
 - Tag the new version, e.g. `git tag -a v1.28.0 -m v1.28.0`.
 - Push the commit with the tag to GitHub, e.g. `git push --tags origin master`.

### Pushing Artifacts to NPM
Once the released is properly commited and tagged, you can release the artifact to NPM in the following way.

Sensor releases are a two-stage process. New releases will initially be tagged with `next`. This gives us time to test the behavior of new sensor versions internally, before pushing the changes out to our users. Once verified that the new version is functional (typically by running it in production for a few days at Instana), the `latest` tag is added.

```
npm publish --tag=next

# once verified that the release works as expected
npm dist-tag add instana-nodejs-sensor@$(node -e "console.log(require('./package.json').version)") latest

# verify that tags have been correctly applied
npm dist-tag ls instana-nodejs-sensor
```
