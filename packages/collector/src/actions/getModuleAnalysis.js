/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2018
 */

'use strict';

exports.getModuleAnalysis = function getModuleAnalysis(request, multiCb) {
  multiCb({
    data: {
      cwd: process.cwd(),
      'require.main.filename': require.main ? require.main.filename : undefined,
      'require.main.paths': require.main ? require.main.paths : undefined,
      'require.cache': Object.keys(require.cache)
    }
  });
};
