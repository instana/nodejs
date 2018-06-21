#!/usr/bin/env bash

set -e

# We aren't properly shutting down these services. Therefore
# the internal data store might get corrupted. Completely clean up
# existing images to ensure that we will not hunt ghost bugs.
docker-compose kill
docker-compose rm -f
docker-compose up -d || true
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

npm run test
