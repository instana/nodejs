/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

/**
 * @param {import("../agent/requestHandler").AnnounceRequest} _request
 * @param {(data: Object.<string, *>) => void} multiCb
 */
exports.getModuleAnalysis = function getModuleAnalysis(_request, multiCb) {
  multiCb({
    data: {
      cwd: process.cwd(),
      'require.main.filename': require.main ? require.main.filename : undefined,
      'require.main.paths': require.main ? require.main.paths : undefined,
      'require.cache': Object.keys(require.cache)
    }
  });
};
