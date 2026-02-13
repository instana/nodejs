/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  datasource: {
    url: process.env.INSTANA_PRISMA_SQLITE_URL
  }
});
