'use strict';

var Module = require('module');
var fs = require('fs');

var logger = require('../logger').getLogger('actions/profiling/cpu');

exports.getSourceFile = function(request, multiCb) {
  var mod = Module._cache[request.args.file];

  if (!mod) {
    multiCb({
      error: 'File is not available in the Node.js module cache.'
    });
    return;
  }

  fs.readFile(mod.filename, {encoding: 'utf8'}, function(error, content) {
    if (error) {
      logger.warn(
        'Failed to retrieve source file for user request: %s. Tried to read file %s.',
        request.args.file,
        mod.filename,
        {error: error}
      );
      multiCb({
        error: 'Could not load file. Error: ' + error.message
      });
      return;
    }

    multiCb({
      data: content
    });
  });
};
