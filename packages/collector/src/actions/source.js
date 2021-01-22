/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2016
 */

'use strict';

const fs = require('fs');

let logger;
logger = require('../logger').getLogger('actions/source', newLogger => {
  logger = newLogger;
});

const validFileRequests = /\.(js|ts|jsx)$|(^|\/)package\.json$/i;

exports.getSourceFile = (request, multiCb) => {
  if (!request.args.file.match(validFileRequests)) {
    multiCb({
      error: 'File does not seem to be a JavaScript file.'
    });
    return;
  }

  readFile(request, multiCb);
};

function readFile(request, multiCb) {
  fs.readFile(request.args.file, { encoding: 'utf8' }, (error, content) => {
    if (error) {
      logger.debug('Failed to retrieve source file for user request: %s.', request.args.file, { error });
      multiCb({
        error: `Could not load file. Error: ${error.message}`
      });
      return;
    }

    multiCb({
      data: content
    });
  });
}
