/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// NOTE: default docker compose hosts, ports and credentials
//       We could later add dotenv if there are more use cases
const DEFAULT_ENV_VALUES = {
  MONGODB: '127.0.0.1:27017',
  ELASTICSEARCH: '127.0.0.1:9200',
  ZOOKEEPER: '127.0.0.1:2181',
  KAFKA: '127.0.0.1:9092',
  REDIS: '127.0.0.1:6379',
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3306',
  MYSQL_USER: 'node',
  MYSQL_PW: 'nodepw',
  MYSQL_DB: 'nodedb',
  POSTGRES_USER: 'node',
  POSTGRES_PASSWORD: 'nodepw',
  POSTGRES_DB: 'nodedb',
  POSTGRES_HOST: '127.0.0.1',
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
