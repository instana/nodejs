/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  datasource: {
    url: process.env.INSTANA_CONNECT_POSTGRES_PRISMA_URL
  }
});
