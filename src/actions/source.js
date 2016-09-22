'use strict';

var relative = require('path').relative;
var Module = require('module');
var fs = require('fs');

var logger = require('../logger').getLogger('actions/profiling/cpu');

var validFileRequests = /\.js$/i;

exports.getSourceFile = function(request, multiCb) {
  if (!request.args.file.match(validFileRequests)) {
    multiCb({
      error: 'File does not seem to be a JavaScript file.'
    });
    return;
  }


  if (Module._cache[request.args.file]) {
    readFile(request, multiCb);
    return;
  }

  if (!isLocatedInRequirePath(request.args.file)) {
    multiCb({
      error: 'File is not located in require path.'
    });
    return;
  }

  readFile(request, multiCb);
};


function isLocatedInRequirePath(file) {
  for (var i = 0, len = module.paths.length; i < len; i++) {
    var path = module.paths[i];

    if (!relative(path, file).match(/^\.\.\//)) {
      return true;
    }
  }

  return false;
}


function readFile(request, multiCb) {
  fs.readFile(request.args.file, {encoding: 'utf8'}, function(error, content) {
    if (error) {
      logger.warn(
        'Failed to retrieve source file for user request: %s.',
        request.args.file,
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
}


// module.paths
// paths:
//    [ '/Users/ben/projects/instana/repos/repl/node_modules',
//      '/Users/ben/projects/instana/repos/node_modules',
//      '/Users/ben/projects/instana/node_modules',
//      '/Users/ben/projects/node_modules',
//      '/Users/ben/node_modules',
//      '/Users/node_modules',
//      '/Users/ben/.node_modules',
//      '/Users/ben/.node_libraries',
//      '/Users/ben/.nvm/versions/node/v6.2.0/lib/node' ]
// /Users/ben/projects/instana/repos/nodejs-sensor/node_modules/request/request.js
