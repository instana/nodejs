/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

/**
 * @typedef {import('@instana/core/src/util/stackTrace').InstanaExtendedError} InstanaExtendedError
 */

const serializeError = require('serialize-error');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;
logger = require('../logger').getLogger('util/uncaughtExceptionHandler', newLogger => {
  logger = newLogger;
});

/** @type {import('../agentConnection')} */
let downstreamConnection = null;
/** @type {import('../pidStore')} */
let processIdentityProvider = null;
const unhandledRejectionEventName = 'unhandledRejection';
let unhandledRejectionDeprecationWarningHasBeenEmitted = false;

/** @type {import('../types/collector').CollectorConfig} */
let config;

// see
// https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode /
// https://github.com/nodejs/node/pull/26599
let unhandledRejectionsMode = 'warn/default';
for (let i = 0; i < process.execArgv.length; i++) {
  if (process.execArgv[i] === '--unhandled-rejections=none') {
    unhandledRejectionsMode = 'none';
  } else if (process.execArgv[i] === '--unhandled-rejections=strict') {
    unhandledRejectionsMode = 'strict';
  }
}

/**
 * @param {import('../types/collector').CollectorConfig} _config
 * @param {import('../agentConnection')} _downstreamConnection
 * @param {import('../pidStore')} _processIdentityProvider
 */
exports.init = function (_config, _downstreamConnection, _processIdentityProvider) {
  config = _config;
  downstreamConnection = _downstreamConnection;
  processIdentityProvider = _processIdentityProvider;
};

exports.activate = function () {
  activateUnhandledPromiseRejectionHandling();
};

exports.deactivate = function () {
  process.removeListener(unhandledRejectionEventName, onUnhandledRejection);
};

function activateUnhandledPromiseRejectionHandling() {
  if (config.reportUnhandledPromiseRejections) {
    if (unhandledRejectionsMode === 'strict') {
      logger.warn(
        'Node.js has been started with --unhandled-rejections=strict, therefore reporting unhandled promise ' +
          'rejections will not be enabled.'
      );
      return;
    }
    process.on(unhandledRejectionEventName, onUnhandledRejection);
    logger.info('Reporting unhandled promise rejections is enabled.');
  } else {
    logger.info('Reporting unhandled promise rejections is disabled.');
  }
}

/**
 * @param {Error} reason
 */
function onUnhandledRejection(reason) {
  if (unhandledRejectionsMode !== 'none') {
    // Best effort to emit the same log messages that Node.js does by default (when no handler for the
    // unhandledRejection event is installed.
    // eslint-disable-next-line no-console
    console.warn('UnhandledPromiseRejectionWarning:', reason);
    // eslint-disable-next-line no-console
    console.warn(
      'UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing ' +
        'inside of an async function without a catch block, or by rejecting a promise which was not handled with ' +
        '.catch().'
    );
    if (!unhandledRejectionDeprecationWarningHasBeenEmitted) {
      // eslint-disable-next-line no-console
      console.warn(
        '[DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise ' +
          'rejections that are not handled will terminate the Node.js process with a non-zero exit code.'
      );
      unhandledRejectionDeprecationWarningHasBeenEmitted = true;
    }
  }

  downstreamConnection.sendEvent(createEventForUnhandledRejection(reason), error => {
    if (error) {
      logger.error('Error received while trying to send event to agent: %s', error.message);
    }
  });
}

/**
 * @param {Error} reason
 * @returns {import('../agentConnection').Event}
 */
function createEventForUnhandledRejection(reason) {
  return createEvent(reason, 'An unhandled promise rejection occured in a Node.js process.', 5, true);
}

/**
 * @param {Error} error
 * @param {string} title
 * @param {import('../agentConnection').ProblemSeverity} severity
 * @param {boolean} isPromiseRejection
 * @returns {import('../agentConnection').Event}
 */
function createEvent(error, title, severity, isPromiseRejection) {
  /** @type {string} */
  let eventText;
  if (error != null) {
    eventText = errorToMarkdown(error);
  } else if (isPromiseRejection) {
    eventText = 'No "reason" parameter has been provided when the promise was rejected.';
  } else {
    eventText = 'A null/undefined value has been thrown.';
  }
  return {
    title,
    text: eventText,
    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
    id:
      processIdentityProvider && typeof processIdentityProvider.getEntityId === 'function'
        ? processIdentityProvider.getEntityId()
        : undefined,
    timestamp: Date.now(),
    duration: 1,
    severity
  };
}

/**
 * @param {Error} error
 * @returns {string}
 */
function errorToMarkdown(error) {
  /* eslint-disable max-len */
  /** @type {import('serialize-error').ErrorObject} ErrorObject */
  const serializedError = serializeError.serializeError(error);

  if (serializedError.name && serializedError.message && typeof serializedError.stack === 'string') {
    // prettier-ignore
    return `### ${serializedError.name}\n\n#### Message: \n\n${serializedError.message}\n\n#### Stack:\n\n${stackTraceToMarkdown(serializedError.stack)}`;
  } else {
    return JSON.stringify(serializedError);
  }
  /* eslint-enable max-len */
}

/**
 * @param {string} stackTrace
 * @returns {string}
 */
function stackTraceToMarkdown(stackTrace) {
  let formatted = '';
  const callSites = stackTrace.split('\n');
  callSites.forEach(callSite => {
    formatted = `${formatted}* \`${callSite.trim()}\`\n`;
  });
  return formatted;
}
