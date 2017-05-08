# Contributing

## Release Process
Sensor releases are a two-stage process. New releases will initially be tagged with `next`. This gives us time to test the behavior of new sensor versions internally, before pushing the changes out to our users. Once verified that the new version is functional (typically by running it in production for a few days at Instana), the `latest` tag is added. All this can be done via `npm` in the following way:

```
npm version (major|minor|patch)
npm publish --tag=next

# once verified that the release works as expected
npm dist-tag add instana-nodejs-sensor@<sensor version> latest

# verify that tags have been correctly applied
npm dist-tag ls instana-nodejs-sensor
```


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
export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="3306"
export MYSQL_USER="root"
export MYSQL_PW="nodepw"
export MYSQL_DB="nodedb"
npm test
```
