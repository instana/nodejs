/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const cluster = require('cluster');

const requireHook = require('@instana/core').util.requireHook;
const selfPath = require('./selfPath');

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../../../logger').getLogger('tracing/edgemicro', newLogger => {
  logger = newLogger;
});

exports.init = function () {
  requireHook.onFileLoad(/\/edgemicro\/cli\/lib\/reload-cluster.js/, instrumentReloadCluster);
};

/**
 * This instruments the code that is responsible for starting the cluster of edgemicro workers that handle HTTP
 * requests, when edgemicro is started via `edgemicro start`. It adds --require /path/to/@instana/collecor/src/immediate
 * to the arguments, effectively adding Instana instrumentation to the worker processes at the earliest possible moment.
 *
 * There is also ./childProcess.js, which is responsible for instrumenting the code path that is used with
 * `edgemicro forever -a start`.
 *
 * @param {*} reloadClusterModule
 * @returns {*}
 */
function instrumentReloadCluster(reloadClusterModule) {
  return function () {
    if (!selfPath.immediate) {
      logger.warn(
        // eslint-disable-next-line max-len
        "Detected a call to 'edgemicro/cli/lib/reload-cluster', but the path to @instana/collector is not available, so the edgemicro workers will not be instrumented."
      );
      return reloadClusterModule.apply(this, arguments);
    }

    // Deliberately not using the isActive pattern here because the edgemicro workers are started immediately by the
    // edgemicro CLI, before the connection to the Instana agent is established (and thus isActive becoming true).
    const clusterManager = reloadClusterModule.apply(this, arguments);
    cluster.settings.execArgv = cluster.settings.execArgv || [];
    for (let i = 0; i < cluster.settings.execArgv.length; i++) {
      if (cluster.settings.execArgv[i].indexOf('--require') >= 0) {
        return clusterManager;
      }
    }

    logger.debug(
      // eslint-disable-next-line max-len
      `Detected a call to 'edgemicro/cli/lib/reload-cluster', instrumenting edgemicro workers by adding --require ${selfPath.immediate} to cluster.settings.execArgv.`
    );
    cluster.settings.execArgv.push('--require');
    cluster.settings.execArgv.push(selfPath.immediate);
    return clusterManager;
  };
}

exports.activate = function () {
  // no-op
};

exports.deactivate = function () {
  // no-op
};
