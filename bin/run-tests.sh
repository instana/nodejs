#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

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
export POSTGRES_USER="node"
export POSTGRES_PASSWORD="nodepw"
export POSTGRES_DB="nodedb"

npm run test:nolint

