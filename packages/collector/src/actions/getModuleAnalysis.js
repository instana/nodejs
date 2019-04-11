'use strict';

exports.getModuleAnalysis = function(request, multiCb) {
  multiCb({
    data: {
      cwd: process.cwd(),
      'require.main.filename': require.main ? require.main.filename : undefined,
      'require.main.paths': require.main ? require.main.paths : undefined,
      'require.cache': Object.keys(require.cache)
    }
  });
};
