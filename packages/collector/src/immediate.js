'use strict';

const { util: coreUtil } = require('@instana/core');

// This file can be used with NODE_OPTIONS or `node --require` to instrument a Node.js app with Instana without
// modifying the source code. See
// https://www.instana.com/docs/ecosystem/node-js/installation#installation-without-modifying-the-source-code

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

if (!isExcludedFromInstrumentation) {
  require('./index')();
}
