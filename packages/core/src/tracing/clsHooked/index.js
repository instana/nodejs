/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const semver = require('semver');

/**
 * In order to increase Node.js version support, this loads an implementation of a CLS (continuation local storage) API
 * which is appropriate for the version of Node.js that is running.
 * - Node.js >= 18: AsyncLocalStorage
 * - Node.js < 18: Legacy implementation
 *
 * Known Bugs:
 * - Node.js 16.7 introduced a bug that breaks AsyncLocalStorage:
 *   https://github.com/nodejs/node/issues/40693
 *   This bug affected the functionality of AsyncLocalStorage until it was fixed in:
 *   - Node.js 16.14: https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V16.md#commits
 *   - Node.js 17.2: https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V17.md#commits-5
 *
 * Note: Previous versions are no longer supported as of this update.
 */
if (process.env.INSTANA_FORCE_LEGACY_CLS !== 'true' && semver.satisfies(process.versions.node, '>= 18')) {
  module.exports = require('./async_local_storage_context');
} else {
  module.exports = require('./context');
}
