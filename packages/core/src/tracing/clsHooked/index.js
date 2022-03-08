/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-env es6 */
/* eslint-disable */

// This is a copy of cls-hooked

// We are using a variation of cls-hooked, because we need to add additional cleanup logic.
// cls-hooked in its published version does not permit removal of values added to contexts.
// This is problematic for us in cases where sockets are long lived, e.g. http agents with
// maxSockets: Infinity. In such cases, the addition of the Node.js collector and the values it
// adds to async contexts (which are kept alive due to the living sockets), can tip a Node.js
// process over the edge.
//
// See also:
// https://github.com/Jeff-Lewis/cls-hooked/issues/21
// https://github.com/Jeff-Lewis/cls-hooked/issues/11

// Changes:
// - rename the symbols to avoid name clashes
// - have Namespace.prototype.set return a function which can be used to unset the value from the context
//   on which it was originally set.

// Copy of
// Jeff-Lewis, feat(compat): v4.2 for node v4.7-v8 (0ebfb9b  on Jul 21, 2017)
// https://github.com/Jeff-Lewis/cls-hooked/blob/066c6c4027a7924b06997cc6b175b1841342abdc/index.js

'use strict';

const semver = require('semver');

/**
 * In order to increase Node.js version support, this loads an implementation of a CLS (continuation local storage) API
 * which is appropriate for the version of on Node.js that is running.
 * - Node.js < 12.17: our vendored-in fork of cls-hooked (based on async_hooks)
 * - Node.js 12.17 - 16.6: AsyncLocalStorage
 * - Node.js 16.7 - 16.6: our vendored-in fork of cls-hooked (based on async_hooks) (see below for reasons)
 * - Node.js >= 16.14: AsyncLocalStorage
 *
 * There is a bug introduced in Node 16.7 which breaks AsyncLocalStorage: https://github.com/nodejs/node/issues/40693
 * - AsyncLocalStorage fix introduced in v17.2: https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V17.md#commits-5
 * - AsyncLocalStorage fix introduced in v16.14: https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V16.md#commits
 */
if (
  process.env.INSTANA_FORCE_LEGACY_CLS !== 'true' &&
  semver.satisfies(process.versions.node, '12.17 - 16.6 || ^16.14 || >=17.2')
) {
  module.exports = require('./async_local_storage_context');
} else {
  module.exports = require('./context');
}
