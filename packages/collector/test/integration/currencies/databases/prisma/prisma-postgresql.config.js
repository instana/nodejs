/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  datasource: {
    url: process.env.PRISMA_POSTGRES_URL
  }
});
