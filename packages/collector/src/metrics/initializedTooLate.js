/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const hasThePackageBeenInitializedTooLate = require('@instana/core').util.hasThePackageBeenInitializedTooLate;

exports.payloadPrefix = 'initTooLate';
exports.currentPayload = undefined;

/*
 * This is now also reported as a monitoring event, see ../util/initializedTooLate.js. We keep the custom reporting
 * mechanism via snapshot data around for a while in parallel to accomodate for older self hosted environments that do
 * not yet support monitoring events.
 *
 * This metric can be removed a while later.
 */

exports.activate = function activate() {
  if (hasThePackageBeenInitializedTooLate()) {
    exports.currentPayload = true;
  }
};
