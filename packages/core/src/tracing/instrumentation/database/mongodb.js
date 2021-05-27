/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

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

exports.spanName = 'mongo';
exports.batchable = true;

exports.init = function init() {
  // unified topology layer
  requireHook.onFileLoad(/\/mongodb\/lib\/cmap\/connection.js/, instrumentCmapConnection);
  // mongodb >= 3.3.x, legacy topology layer
  requireHook.onFileLoad(/\/mongodb\/lib\/core\/connection\/pool.js/, instrumentLegacyTopologyPool);
  // mongodb < 3.3.x, legacy topology layer
  requireHook.onFileLoad(/\/mongodb-core\/lib\/connection\/pool.js/, instrumentLegacyTopologyPool);
};

function instrumentCmapConnection(connection) {
  if (connection.Connection && connection.Connection.prototype) {
    // collection.findOne, collection.find et al.
    shimmer.wrap(connection.Connection.prototype, 'query', shimCmapQuery);
    // collection.count et al.
    shimmer.wrap(connection.Connection.prototype, 'command', shimCmapCommand);

    [
      'insert', // collection.insertOne et al.
      'update', // collection.replaceOne et al.
      'remove' // collection.delete et al.
    ].forEach(fnName => {
      if (connection.Connection.prototype[fnName]) {
        shimmer.wrap(connection.Connection.prototype, fnName, shimCmapMethod);
      }
    });

    shimmer.wrap(connection.Connection.prototype, 'getMore', shimCmapGetMore);
  }
}

function shimCmapQuery(original) {
  return function tmp() {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedCmapQuery(this, original, originalArgs);
  };
}

function shimCmapCommand(original) {
  return function () {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    const command = arguments[1] && commands.find(c => arguments[1][c]);

    if (!command) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedCmapMethod(this, original, originalArgs, command);
  };
}

function shimCmapMethod(original) {
  return function () {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedCmapMethod(this, original, originalArgs, original.name);
  };
}

function shimCmapGetMore(original) {
  return function () {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedCmapGetMore(this, original, originalArgs);
  };
}

function instrumentedCmapQuery(ctx, originalQuery, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalQuery.apply(ctx, originalArgs);
  }

  const { originalCallback, callbackIndex } = findCallback(originalArgs);
  if (callbackIndex < 0) {
    return originalQuery.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

    const namespace = originalArgs[0];
    const cmd = originalArgs[1];

    let command;
    if (cmd) {
      command = findCommand(cmd);
    }

    let service;
    if (ctx.address) {
      service = ctx.address;
      span.data.peer = splitIntoHostAndPort(ctx.address);
    }

    span.data.mongo = {
      command,
      service,
      namespace
    };
    readJsonOrFilter(cmd, span);

    originalArgs[callbackIndex] = createWrappedCallback(span, originalCallback);

    return originalQuery.apply(ctx, originalArgs);
  });
}

function instrumentedCmapMethod(ctx, originalMethod, originalArgs, command) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalMethod.apply(ctx, originalArgs);
  }

  const { originalCallback, callbackIndex } = findCallback(originalArgs);
  if (callbackIndex < 0) {
    return originalMethod.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

    const namespace = originalArgs[0];

    let service;
    if (ctx.address) {
      service = ctx.address;
      span.data.peer = splitIntoHostAndPort(ctx.address);
    }

    span.data.mongo = {
      command,
      service,
      namespace
    };

    if (command && command.indexOf('insert') < 0) {
      // we do not capture the document for insert commands
      readJsonOrFilter(originalArgs[1], span);
    }

    originalArgs[callbackIndex] = createWrappedCallback(span, originalCallback);

    return originalMethod.apply(ctx, originalArgs);
  });
}

function instrumentedCmapGetMore(ctx, originalMethod, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalMethod.apply(ctx, originalArgs);
  }

  const { originalCallback, callbackIndex } = findCallback(originalArgs);
  if (callbackIndex < 0) {
    return originalMethod.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

    const namespace = originalArgs[0];

    let service;
    if (ctx.address) {
      service = ctx.address;
      span.data.peer = splitIntoHostAndPort(ctx.address);
    }

    span.data.mongo = {
      command: 'getMore',
      service,
      namespace
    };

    originalArgs[callbackIndex] = createWrappedCallback(span, originalCallback);

    return originalMethod.apply(ctx, originalArgs);
  });
}

function instrumentLegacyTopologyPool(Pool) {
  shimmer.wrap(Pool.prototype, 'write', shimLegacyWrite);
}

function shimLegacyWrite(original) {
  return function () {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return instrumentedLegacyWrite(this, original, originalArgs);
  };
}

function instrumentedLegacyWrite(ctx, originalWrite, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalWrite.apply(ctx, originalArgs);
  }

  // pool.js#write throws a sync error if there is no callback, so we can safely assume there is one. If there was no
  // callback, we wouldn't be able to finish the span, so we won't start one.
  const { originalCallback, callbackIndex } = findCallback(originalArgs);
  if (callbackIndex < 0) {
    return originalWrite.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedLegacyWrite);

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
    readJsonOrFilterFromMessage(message, span);

    originalArgs[callbackIndex] = createWrappedCallback(span, originalCallback);

    return originalWrite.apply(ctx, originalArgs);
  });
}

function findCallback(originalArgs) {
  let originalCallback;
  let callbackIndex = -1;
  for (let i = 1; i < originalArgs.length; i++) {
    if (typeof originalArgs[i] === 'function') {
      originalCallback = originalArgs[i];
      callbackIndex = i;
      break;
    }
  }
  return {
    originalCallback,
    callbackIndex
  };
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

function splitIntoHostAndPort(address) {
  if (typeof address === 'string') {
    let hostname;
    let port;
    if (address.indexOf(':') >= 0) {
      const idx = address.indexOf(':');
      hostname = address.substring(0, idx);
      port = parseInt(address.substring(idx + 1), 10);
      if (isNaN(port)) {
        port = undefined;
      }
      return {
        hostname,
        port
      };
    } else {
      return {
        hostname: address
      };
    }
  }
}

function readJsonOrFilterFromMessage(message, span) {
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
  return readJsonOrFilter(cmdObj, span);
}

function readJsonOrFilter(cmdObj, span) {
  let json;
  if (Array.isArray(cmdObj) && cmdObj.length >= 1) {
    json = cmdObj;
  } else if (Array.isArray(cmdObj.updates) && cmdObj.updates.length >= 1) {
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
  } else if (cmdObj.filter || cmdObj.query) {
    span.data.mongo.filter = stringifyWhenNecessary(cmdObj.filter || cmdObj.query);
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

function createWrappedCallback(span, originalCallback) {
  return cls.ns.bind(function (error) {
    if (error) {
      span.ec = 1;
      span.data.mongo.error = tracingUtil.getErrorDetails(error);
    }

    span.d = Date.now() - span.ts;
    span.transmit();

    return originalCallback.apply(this, arguments);
  });
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
