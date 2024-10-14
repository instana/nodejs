/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const semver = require('semver');

/**
 * In order to increase Node.js version support, this loads an implementation of a CLS (continuation local storage) API
 * which is appropriate for the version of on Node.js that is running.
 * - Node.js 14.0 - 16.6: AsyncLocalStorage
 * - Node.js 16.7 - 16.6: our vendored-in fork of cls-hooked (based on async_hooks) (see below for reasons)
 * - Node.js >= 16.14: AsyncLocalStorage
 *
 * There is a bug introduced in Node 16.7 which breaks AsyncLocalStorage: https://github.com/nodejs/node/issues/40693
 * - AsyncLocalStorage fix introduced in v17.2: https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V17.md#commits-5
 * - AsyncLocalStorage fix introduced in v16.14: https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V16.md#commits
 */

const includePrerelease = process.env.NODE_ENV === 'test';
if (
  process.env.INSTANA_FORCE_LEGACY_CLS !== 'true' &&
  semver.satisfies(process.versions.node, '14.0 - 16.6 || ^16.14 || >=17.2', { includePrerelease })
) {
  module.exports = require('./async_local_storage_context');
} else {
  module.exports = require('./context');
}
