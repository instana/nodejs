/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { defineConfig } = require('prisma/config');

const host = process.env.INSTANA_CONNECT_MYSQL_HOST;
const port = process.env.INSTANA_CONNECT_MYSQL_PORT;
const user = process.env.INSTANA_CONNECT_MYSQL_USER;
const password = process.env.INSTANA_CONNECT_MYSQL_PW;
const database = process.env.INSTANA_CONNECT_MYSQL_DB;

module.exports = defineConfig({
  datasource: {
    url: `mysql://${user}:${password}@${host}:${port}/${database}`
  }
});
