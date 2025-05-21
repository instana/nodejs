/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const semver = require('semver');

// NOTE: default docker compose hosts, ports and credentials
const DEFAULT_ENV_VALUES = {
  MONGODB: '127.0.0.1:27017',
  ELASTICSEARCH: '127.0.0.1:9200',
  ELASTICSEARCH_ALTERNATIVE: 'localhost:9200',
  ZOOKEEPER: '127.0.0.1:2181',
  KAFKA: '127.0.0.1:9092',
  REDIS: '127.0.0.1:6379',
  REDIS_ALTERNATIVE: 'localhost:6379',
  REDIS_SENTINEL_MASTER_NAME: 'mymaster',
  REDIS_SENTINEL_HOST: '127.0.0.1',
  REDIS_SENTINEL_PORT_1: 26379,
  REDIS_SENTINEL_PORT_2: 26380,
  REDIS_SENTINEL_PORT_3: 26381,
  COUCHBASE: 'couchbase://127.0.0.1:11210',
  COUCHBASE_ALTERNATIVE: 'couchbase://127.0.0.1',
  COUCHBASE_WEB_UI: 'http://127.0.0.1:8091',
  LOCALSTACK_AWS: 'localstack://127.0.0.1:4566',
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3306',
  MYSQL_USER: 'node',
  MYSQL_PW: 'nodepw',
  MYSQL_DB: 'nodedb',
  AMQP: 'amqp://127.0.0.1',
  NATS: 'nats://127.0.0.1:4222',
  NATS_ALTERNATIVE: 'nats://localhost:4222',
  NATS_STREAMING: 'nats://127.0.0.1:4223',
  NATS_STREAMING_ALTERNATIVE: 'nats://127.0.0.1:4224',
  POSTGRES_USER: 'node',
  POSTGRES_PASSWORD: 'nodepw',
  POSTGRES_DB: 'nodedb',
  POSTGRES_HOST: '127.0.0.1',
  PRISMA_POSTGRES_URL: `postgresql://node:nodepw@127.0.0.1/nodedb?schema=prisma-${semver.major(process.version)}`,
  MSSQL_HOST: 'localhost',
  MSSQL_PORT: '1433',
  MSSQL_USER: 'sa',
  MSSQL_PW: 'stanCanHazMsSQL1'
};

// CASE: if env variable is not set from outside, fallback to defaults
Object.keys(DEFAULT_ENV_VALUES).forEach(key => {
  if (!process.env[key]) {
    process.env[key] = DEFAULT_ENV_VALUES[key];
  }
});
