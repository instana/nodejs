/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const { uninstrumentedFs: fs } = require('@instana/core');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

const validFileRequests = /\.(js|ts|jsx)$|(^|\/)package\.json$/i;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * @param {import('../agent/requestHandler').AnnounceRequest} request
 * @param {(data: Object.<string, *>) => void} multiCb
 */
exports.getSourceFile = (request, multiCb) => {
  if (!request.args.file.match(validFileRequests)) {
    multiCb({
      error: 'File does not seem to be a JavaScript file.'
    });
    return;
  }

  readFile(request, multiCb);
};

/**
 * @param {import('../agent/requestHandler').AnnounceRequest} request
 * @param {(data: Object.<string, *>) => void} multiCb
 */
function readFile(request, multiCb) {
  fs.readFile(request.args.file, { encoding: 'utf8' }, (error, content) => {
    if (error) {
      logger.debug(
        `Failed to retrieve source file for user request: ${request.args.file}. ${error?.message} ${error?.stack}`
      );
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
