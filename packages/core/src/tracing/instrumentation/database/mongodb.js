'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

const commands = [
  //
  'aggregate',
  'count',
  'delete',
  'distinct',
  'find',
  'findAndModify',
  'findandmodify',
  'getMore',
  'getmore',
  'insert',
  'update'
];

exports.init = function init() {
  // mongodb >= 3.3.x
  requireHook.onFileLoad(/\/mongodb\/lib\/core\/connection\/pool.js/, instrumentPool);
  // mongodb < 3.3.x
  requireHook.onFileLoad(/\/mongodb-core\/lib\/connection\/pool.js/, instrumentPool);
};

function instrumentPool(Pool) {
  shimmer.wrap(Pool.prototype, 'write', shimWrite);
}

function shimWrite(original) {
  return function() {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return instrumentedWrite(this, original, originalArgs);
  };
}

function instrumentedWrite(ctx, originalWrite, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalWrite.apply(ctx, originalArgs);
  }

  // pool.js#write throws a sync error if there is no callback, so we can safely assume there is one. If there was no
  // callback, we wouldn't be able to finish the span, so we won't start one.
  let originalCallback;
  let callbackIndex = -1;
  for (let i = 1; i < originalArgs.length; i++) {
    if (typeof originalArgs[i] === 'function') {
      originalCallback = originalArgs[i];
      callbackIndex = i;
      break;
    }
  }
  if (callbackIndex < 0) {
    return originalWrite.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('mongo', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedWrite);

    let hostname;
    let port;
    let service;
    let command;
    let database;
    let collection;
    let namespace;

    const message = originalArgs[0];
    if (message && typeof message === 'object') {
      if (
        message.options &&
        message.options.session &&
        message.options.session.topology &&
        message.options.session.topology.s &&
        message.options.session.topology.s
      ) {
        hostname = message.options.session.topology.s.host;
        port = message.options.session.topology.s.port;
      }

      if ((!hostname || !port) && ctx.options) {
        // fallback for older versions of mongodb package
        if (!hostname) {
          hostname = ctx.options.host;
        }
        if (!port) {
          port = ctx.options.port;
        }
      }

      let cmdObj = message.command;
      if (!cmdObj) {
        // fallback for older mongodb versions
        cmdObj = message.query;
      }
      if (cmdObj) {
        if (cmdObj.collection) {
          // only getMore commands have the collection attribute
          collection = cmdObj.collection;
        }
        if (!collection) {
          collection = findCollection(cmdObj);
        }
        command = findCommand(cmdObj);
        database = cmdObj.$db;
      }

      if (!database && typeof message.ns === 'string') {
        // fallback for older mongodb versions
        database = message.ns.split('.')[0];
      }
    }

    if (database && collection) {
      namespace = `${database}.${collection}`;
    } else if (database) {
      namespace = `${database}.?`;
    } else if (collection) {
      namespace = `?.${collection}`;
    }

    if (hostname || port) {
      span.data.peer = {
        hostname,
        port
      };
    }

    if (hostname && port) {
      service = `${hostname}:${port}`;
    } else if (hostname) {
      service = `${hostname}:27017`;
    } else if (port) {
      service = '?:27017';
    }

    span.data.mongo = {
      command,
      service,
      namespace
    };
    readJsonOrFilter(message, span);

    const wrappedCallback = function(error) {
      if (error) {
        span.ec = 1;
        span.data.mongo.error = tracingUtil.getErrorDetails(error);
      }

      span.d = Date.now() - span.ts;
      span.transmit();

      return originalCallback.apply(this, arguments);
    };
    originalArgs[callbackIndex] = cls.ns.bind(wrappedCallback);

    return originalWrite.apply(ctx, originalArgs);
  });
}

function findCollection(cmdObj) {
  for (let j = 0; j < commands.length; j++) {
    if (cmdObj[commands[j]] && typeof cmdObj[commands[j]] === 'string') {
      // most commands (except for getMore) add the collection as the value for the command-specific key
      return cmdObj[commands[j]];
    }
  }
}

function findCommand(cmdObj) {
  for (let j = 0; j < commands.length; j++) {
    if (cmdObj[commands[j]]) {
      return commands[j];
    }
  }
}

function readJsonOrFilter(message, span) {
  if (!message) {
    return;
  }
  let cmdObj = message.command;
  if (!cmdObj) {
    cmdObj = message.query;
  }
  if (!cmdObj) {
    return;
  }
  let json;
  const filter = cmdObj.filter || cmdObj.query;

  if (Array.isArray(cmdObj.updates) && cmdObj.updates.length >= 1) {
    json = cmdObj.updates;
  } else if (Array.isArray(cmdObj.deletes) && cmdObj.deletes.length >= 1) {
    json = cmdObj.deletes;
  } else if (Array.isArray(cmdObj.pipeline) && cmdObj.pipeline.length >= 1) {
    json = cmdObj.pipeline;
  }

  // The back end will process exactly one of json, query, or filter, so it does not matter too much which one we
  // provide.
  if (json) {
    span.data.mongo.json = stringifyWhenNecessary(json);
  } else if (filter) {
    span.data.mongo.filter = stringifyWhenNecessary(filter);
  }
}

function stringifyWhenNecessary(obj) {
  if (obj == null) {
    return undefined;
  } else if (typeof obj === 'string') {
    return tracingUtil.shortenDatabaseStatement(obj);
  }
  return tracingUtil.shortenDatabaseStatement(JSON.stringify(obj));
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
