'use strict';

var fs = require('fs');

var logger = require('../logger').getLogger('actions/profiling/cpu');

var validFileRequests = /\.(js|ts|jsx)$|(^|\/)package\.json$/i;

exports.getSourceFile = function(request, multiCb) {
  if (!request.args.file.match(validFileRequests)) {
    multiCb({
      error: 'File does not seem to be a JavaScript file.'
    });
    return;
  }

  readFile(request, multiCb);
};

function readFile(request, multiCb) {
  fs.readFile(request.args.file, { encoding: 'utf8' }, function(error, content) {
    if (error) {
      logger.debug('Failed to retrieve source file for user request: %s.', request.args.file, { error: error });
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
