# Contributing

## Executing Tests locally
Some of the tests require databases to run locally. The easiest way to run these databases locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/). Execute these commands to set up all the necessary databases and environment variables.

```shell
# We aren't properly shutting down these services. Therefore
# the internal data store might get corrupted. Completely clean up
# existing images to ensure that we will not hunt ghost bugs.
docker-compose kill && docker-compose rm -f && docker-compose up
export MONGODB="127.0.0.1:27017"
export ELASTICSEARCH="127.0.0.1:9200"
export ZOOKEEPER="127.0.0.1:2181"
export KAFKA="127.0.0.1:9092"
export REDIS="127.0.0.1:6379"
export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="3306"
export MYSQL_USER="root"
export MYSQL_PW="nodepw"
export MYSQL_DB="nodedb"
npm test
```


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
npm dist-tag add instana-nodejs-sensor@<sensor version> latest

# verify that tags have been correctly applied
npm dist-tag ls instana-nodejs-sensor
```
