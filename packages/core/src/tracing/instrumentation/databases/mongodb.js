/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;
let logger;

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

exports.init = function init(config) {
  logger = config.logger;
  // unified topology layer
  hook.onFileLoad(/\/mongodb\/lib\/cmap\/connection\.js/, instrumentCmapConnection);
  // mongodb >= 3.3.x, legacy topology layer
  hook.onFileLoad(/\/mongodb\/lib\/core\/connection\/pool\.js/, instrumentLegacyTopologyPool);
  // mongodb < 3.3.x, legacy topology layer
  hook.onFileLoad(/\/mongodb-core\/lib\/connection\/pool\.js/, instrumentLegacyTopologyPool);
};

function instrumentCmapConnection(connection) {
  if (logger) {
    logger.debug('[MongoDB] Instrumenting CMAP connection (unified topology layer)');
  }
  if (connection.Connection && connection.Connection.prototype) {
    // v4, v5
    if (!connection.Connection.prototype.query) {
      shimmer.wrap(connection.Connection.prototype, 'command', shimCmapCommand);
    } else {
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
          shimmer.wrap(connection.Connection.prototype, fnName, shimCmapMethod.bind(null, fnName));
        }
      });

      shimmer.wrap(connection.Connection.prototype, 'getMore', shimCmapGetMore);
    }
  }
}

function shimCmapQuery(original) {
  return function tmp() {
    // Only use checkReducedSpan if there's no active current span
    // This ensures we only use reduced spans for background queries, not for normal queries
    const currentSpan = cls.getCurrentSpan();
    const useReducedSpan = !currentSpan;
    const skipResult = cls.skipExitTracing({ isActive, extendedResponse: true, checkReducedSpan: useReducedSpan });

    if (skipResult.skip) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    // Extract trace ID and parent span ID from parent span if available (including reduced spans)
    const parentSpan = skipResult.parentSpan;
    const traceId = parentSpan ? parentSpan.t : undefined;
    const parentSpanId = parentSpan ? parentSpan.s : undefined;

    return instrumentedCmapQuery(this, original, originalArgs, traceId, parentSpanId);
  };
}

function shimCmapCommand(original) {
  return function () {
    // Only use checkReducedSpan if there's no active current span
    // This ensures we only use reduced spans for background queries, not for normal queries
    const currentSpan = cls.getCurrentSpan();
    const useReducedSpan = !currentSpan;

    const command =
      arguments[1] && typeof arguments[1] === 'object' && arguments[1] !== null
        ? commands.find(c => arguments[1][c])
        : undefined;

    // Skip parent span check for getMore because it should create a span even if find span is still active
    // getMore is a separate operation that should be traced independently
    const skipParentSpanCheckForGetMore = command === 'getMore' || command === 'getmore';
    const skipResult = cls.skipExitTracing({
      isActive,
      extendedResponse: true,
      checkReducedSpan: useReducedSpan,
      skipParentSpanCheck: skipParentSpanCheckForGetMore
    });

    if (skipResult.skip) {
      return original.apply(this, arguments);
    }

    if (!command) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    // Extract trace ID and parent span ID from parent span if available (including reduced spans)
    const parentSpan = skipResult.parentSpan;
    const traceId = parentSpan ? parentSpan.t : undefined;
    const parentSpanId = parentSpan ? parentSpan.s : undefined;

    return instrumentedCmapMethod(this, original, originalArgs, command, traceId, parentSpanId);
  };
}

function shimCmapMethod(fnName, original) {
  return function () {
    // Only use checkReducedSpan if there's no active current span
    // This ensures we only use reduced spans for background queries, not for normal queries
    const currentSpan = cls.getCurrentSpan();
    const useReducedSpan = !currentSpan;
    const skipResult = cls.skipExitTracing({ isActive, extendedResponse: true, checkReducedSpan: useReducedSpan });
    if (skipResult.skip) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    // Extract trace ID and parent span ID from parent span if available (including reduced spans)
    const parentSpan = skipResult.parentSpan;
    const traceId = parentSpan ? parentSpan.t : undefined;
    const parentSpanId = parentSpan ? parentSpan.s : undefined;

    return instrumentedCmapMethod(this, original, originalArgs, fnName, traceId, parentSpanId);
  };
}

function shimCmapGetMore(original) {
  return function () {
    // Only use checkReducedSpan if there's no active current span
    // This ensures we only use reduced spans for background queries, not for normal queries
    const currentSpan = cls.getCurrentSpan();
    const useReducedSpan = !currentSpan;
    // Skip parent span check for getMore because it should create a span even if find span is still active
    // getMore is a separate operation that should be traced independently
    const skipResult = cls.skipExitTracing({
      isActive,
      extendedResponse: true,
      checkReducedSpan: useReducedSpan,
      skipParentSpanCheck: true
    });
    if (skipResult.skip) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    // Extract trace ID and parent span ID from parent span if available (including reduced spans)
    const parentSpan = skipResult.parentSpan;
    const traceId = parentSpan ? parentSpan.t : undefined;
    const parentSpanId = parentSpan ? parentSpan.s : undefined;

    return instrumentedCmapGetMore(this, original, originalArgs, traceId, parentSpanId);
  };
}

function instrumentedCmapQuery(ctx, originalQuery, originalArgs, traceId, parentSpanId) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT,
      traceId: traceId,
      parentSpanId: parentSpanId
    });
    span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

    const namespace = originalArgs && originalArgs.length > 0 ? originalArgs[0] : undefined;
    const cmd = originalArgs && originalArgs.length > 1 ? originalArgs[1] : undefined;

    let command;
    if (cmd && typeof cmd === 'object' && cmd !== null) {
      command = findCommand(cmd);
    }

    let service;
    if (ctx && ctx.address) {
      service = ctx.address;
      span.data.peer = splitIntoHostAndPort(ctx.address);
    }

    span.data.mongo = {
      command: normalizeCommandName(command),
      service,
      namespace
    };

    if (logger && command) {
      logger.debug(
        `[MongoDB] Executing command: ${normalizeCommandName(command)}, namespace: ${
          namespace || 'unknown'
        }, service: ${service || 'unknown'}`
      );
    }

    readJsonOrFilter(cmd, span);
    return handleCallbackOrPromise(ctx, originalArgs, originalQuery, span);
  });
}

function instrumentedCmapMethod(ctx, originalMethod, originalArgs, command, traceId, parentSpanId) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT,
      traceId: traceId,
      parentSpanId: parentSpanId
    });
    span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

    let namespace = originalArgs && originalArgs.length > 0 ? originalArgs[0] : undefined;

    if (namespace && typeof namespace === 'object' && namespace !== null) {
      // NOTE: Sometimes the collection name is "$cmd"
      if (namespace.collection !== '$cmd') {
        namespace = `${namespace.db}.${namespace.collection}`;
      } else if (
        originalArgs.length > 1 &&
        originalArgs[1] &&
        typeof originalArgs[1] === 'object' &&
        originalArgs[1] !== null
      ) {
        const collName = originalArgs[1][command];
        namespace = `${namespace.db}.${collName}`;
      } else {
        namespace = namespace.db;
      }
    }

    let service;
    if (ctx && ctx.address) {
      service = ctx.address;
      span.data.peer = splitIntoHostAndPort(ctx.address);
    }

    span.data.mongo = {
      command: normalizeCommandName(command),
      service,
      namespace
    };

    if (logger && command) {
      logger.debug(
        `[MongoDB] Executing command: ${normalizeCommandName(command)}, namespace: ${
          namespace || 'unknown'
        }, service: ${service || 'unknown'}`
      );
    }

    if (command && command.indexOf('insert') < 0 && originalArgs && originalArgs.length > 1) {
      // we do not capture the document for insert commands
      readJsonOrFilter(originalArgs[1], span);
    }

    return handleCallbackOrPromise(ctx, originalArgs, originalMethod, span);
  });
}

function instrumentedCmapGetMore(ctx, originalMethod, originalArgs, traceId, parentSpanId) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT,
      traceId: traceId,
      parentSpanId: parentSpanId
    });
    span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

    const namespace = originalArgs && originalArgs.length > 0 ? originalArgs[0] : undefined;

    let service;
    if (ctx && ctx.address) {
      service = ctx.address;
      span.data.peer = splitIntoHostAndPort(ctx.address);
    }

    span.data.mongo = {
      command: 'getMore',
      service,
      namespace
    };

    if (logger) {
      logger.debug(
        `[MongoDB] Executing command: getMore, namespace: ${namespace || 'unknown'}, service: ${service || 'unknown'}`
      );
    }

    return handleCallbackOrPromise(ctx, originalArgs, originalMethod, span);
  });
}

function instrumentLegacyTopologyPool(Pool) {
  if (logger) {
    logger.debug('[MongoDB] Instrumenting Legacy Topology Pool');
  }
  if (Pool && Pool.prototype) {
    shimmer.wrap(Pool.prototype, 'write', shimLegacyWrite);
  } else if (logger) {
    logger.debug('[MongoDB] Cannot instrument Legacy Topology Pool: Pool or Pool.prototype is missing');
  }
}

function shimLegacyWrite(original) {
  return function () {
    // Only use checkReducedSpan if there's no active current span
    // This ensures we only use reduced spans for background queries, not for normal queries
    const currentSpan = cls.getCurrentSpan();
    const useReducedSpan = !currentSpan;
    // Try with checkReducedSpan only if no active span exists
    const skipResult = cls.skipExitTracing({
      isActive,
      extendedResponse: true,
      checkReducedSpan: useReducedSpan
    });
    if (skipResult.skip) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    // Extract trace ID and parent span ID from parent span if available
    const parentSpan = skipResult.parentSpan;
    const traceId = parentSpan ? parentSpan.t : undefined;
    const parentSpanId = parentSpan ? parentSpan.s : undefined;

    return instrumentedLegacyWrite(this, original, originalArgs, traceId, parentSpanId);
  };
}

function instrumentedLegacyWrite(ctx, originalWrite, originalArgs, traceId, parentSpanId) {
  return cls.ns.runAndReturn(() => {
    const message = originalArgs && originalArgs.length > 0 ? originalArgs[0] : undefined;
    let command;
    let database;
    let collection;

    // Extract command early to check if we should skip getMore
    if (message && typeof message === 'object' && message !== null) {
      let cmdObj = message.command;
      if (!cmdObj) {
        cmdObj = message.query;
      }
      if (cmdObj) {
        command = findCommand(cmdObj);
      }
    }

    // Skip creating a span for getMore - it's always a continuation of another operation
    // getMore is used to fetch additional batches from a cursor (e.g., find().toArray())
    // and should not create a separate span
    if (command === 'getMore' || command === 'getmore') {
      return originalWrite.apply(ctx, originalArgs);
    }

    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT,
      traceId: traceId,
      parentSpanId: parentSpanId
    });
    span.stack = tracingUtil.getStackTrace(instrumentedLegacyWrite);

    let hostname;
    let port;
    let service;
    let namespace;

    if (message && typeof message === 'object' && message !== null) {
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

      if ((!hostname || !port) && ctx && ctx.options) {
        // fallback for older versions of mongodb package
        if (!hostname) {
          hostname = ctx.options.host;
        }
        if (!port) {
          port = ctx.options.port;
        }
      }

      // Extract command, collection, and database from message
      if (!command || !collection || !database) {
        let cmdObj = message.command;
        if (!cmdObj) {
          // fallback for older mongodb versions
          cmdObj = message.query;
        }
        if (cmdObj) {
          // For getMore commands, the collection is directly in cmdObj.collection
          if (!collection && cmdObj.collection && typeof cmdObj.collection === 'string') {
            collection = cmdObj.collection;
          }
          if (!collection) {
            collection = findCollection(cmdObj);
          }
          if (!command) {
            command = findCommand(cmdObj);
          }
          if (!database) {
            database = cmdObj.$db;
          }
        }
      }

      if (!database && typeof message.ns === 'string') {
        // fallback for older mongodb versions
        database = message.ns.split('.')[0];
      }

      // For insert/update/delete commands sent via $cmd, try to extract collection from command
      if (!collection && command) {
        const cmdObjForCollection = message.command || message.query;
        if (cmdObjForCollection && cmdObjForCollection[command] && typeof cmdObjForCollection[command] === 'string') {
          // Some commands have the collection as the value of the command key
          collection = cmdObjForCollection[command];
        } else if (
          cmdObjForCollection &&
          typeof cmdObjForCollection[command] === 'object' &&
          cmdObjForCollection[command] !== null
        ) {
          // For some commands, the collection might be nested in the command object
          const cmdValue = cmdObjForCollection[command];
          if (cmdValue.collection && typeof cmdValue.collection === 'string') {
            collection = cmdValue.collection;
          }
        }
      }

      // If still no collection and ns is not $cmd, extract from ns
      if (!collection && typeof message.ns === 'string' && !message.ns.endsWith('.$cmd')) {
        const nsParts = message.ns.split('.');
        if (nsParts.length === 2 && nsParts[0] === database) {
          collection = nsParts[1];
        }
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
      command: normalizeCommandName(command),
      service,
      namespace
    };

    if (logger && command) {
      logger.debug(
        `[MongoDB] Executing command: ${normalizeCommandName(command)}, namespace: ${
          namespace || 'unknown'
        }, service: ${service || 'unknown'}`
      );
    }

    readJsonOrFilterFromMessage(message, span);
    return handleCallbackOrPromise(ctx, originalArgs, originalWrite, span);
  });
}

function findCollection(cmdObj) {
  if (!cmdObj || typeof cmdObj !== 'object' || cmdObj === null) {
    return undefined;
  }
  for (let j = 0; j < commands.length; j++) {
    if (cmdObj[commands[j]] && typeof cmdObj[commands[j]] === 'string') {
      // most commands (except for getMore) add the collection as the value for the command-specific key
      return cmdObj[commands[j]];
    }
  }
}

function findCommand(cmdObj) {
  if (!cmdObj || typeof cmdObj !== 'object' || cmdObj === null) {
    return undefined;
  }
  for (let j = 0; j < commands.length; j++) {
    if (cmdObj[commands[j]]) {
      return commands[j];
    }
  }
}

function normalizeCommandName(command) {
  if (!command) {
    return command;
  }
  // Map MongoDB wire protocol command names to API method names
  const commandMap = {
    findAndModify: 'findOneAndUpdate',
    findandmodify: 'findOneAndUpdate'
  };
  return commandMap[command] || command;
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
  if (!cmdObj || !span || !span.data) {
    if (logger && (!cmdObj || !span || !span.data)) {
      logger.debug('[MongoDB] Cannot read JSON/filter: missing cmdObj, span, or span.data');
    }
    return;
  }

  // Prioritize json over filter to match original behavior and test expectations
  let json;
  if (Array.isArray(cmdObj) && cmdObj.length >= 1) {
    json = cmdObj;
  } else if (cmdObj && typeof cmdObj === 'object' && Array.isArray(cmdObj.updates) && cmdObj.updates.length >= 1) {
    // Clean up update objects to only include q and u fields (remove upsert, multi, etc.)
    json = cmdObj.updates.map(update => {
      const cleaned = {};
      if (update.q) cleaned.q = update.q;
      if (update.query) cleaned.q = update.query;
      if (update.filter) cleaned.q = update.filter;
      if (update.u) cleaned.u = update.u;
      if (update.update) cleaned.u = update.update;
      return cleaned;
    });
  } else if (Array.isArray(cmdObj.deletes) && cmdObj.deletes.length >= 1) {
    json = cmdObj.deletes;
  } else if (Array.isArray(cmdObj.pipeline) && cmdObj.pipeline.length >= 1) {
    json = cmdObj.pipeline;
  }

  // The back end will process exactly one of json, query, or filter, so it does not matter too much which one we
  // provide. Prioritize json when available.
  if (!span.data.mongo) {
    if (logger) {
      logger.debug('[MongoDB] Cannot set JSON/filter: span.data.mongo is missing');
    }
    return;
  }
  if (json) {
    span.data.mongo.json = stringifyWhenNecessary(json);
  } else if (cmdObj && typeof cmdObj === 'object' && (cmdObj.filter || cmdObj.query)) {
    span.data.mongo.filter = stringifyWhenNecessary(cmdObj.filter || cmdObj.query);
  } else if (cmdObj && typeof cmdObj === 'object' && cmdObj.q) {
    // For update/delete commands in wire protocol, the filter/query is in 'q' (short for query)
    span.data.mongo.filter = stringifyWhenNecessary(cmdObj.q);
  }
}

function stringifyWhenNecessary(obj) {
  if (obj == null) {
    return undefined;
  } else if (typeof obj === 'string') {
    return tracingUtil.shortenDatabaseStatement(obj);
  }
  try {
    return tracingUtil.shortenDatabaseStatement(JSON.stringify(obj));
  } catch (e) {
    // JSON.stringify can throw on circular references or other issues
    // Return undefined to avoid breaking customer code
    if (logger) {
      logger.debug(`[MongoDB] Failed to stringify object: ${e.message || e}`);
    }
    return undefined;
  }
}

function createWrappedCallback(span, originalCallback) {
  if (!span || !originalCallback) {
    if (logger && (!span || !originalCallback)) {
      logger.debug('[MongoDB] Cannot create wrapped callback: missing span or originalCallback');
    }
    return originalCallback;
  }
  return cls.ns.bind(function (error) {
    if (span) {
      if (error) {
        span.ec = 1;
        tracingUtil.setErrorDetails(span, error, 'mongo');
      }

      span.d = Date.now() - span.ts;
      span.transmit();
    }

    return originalCallback.apply(this, arguments);
  });
}

function handleCallbackOrPromise(ctx, originalArgs, originalFunction, span) {
  if (!originalArgs || !Array.isArray(originalArgs) || !originalFunction || !span) {
    if (logger && (!originalArgs || !Array.isArray(originalArgs) || !originalFunction || !span)) {
      logger.debug(
        '[MongoDB] Cannot handle callback/promise: missing or invalid arguments ' +
          `(originalArgs: ${!!originalArgs}, isArray: ${Array.isArray(originalArgs)}, ` +
          `originalFunction: ${!!originalFunction}, span: ${!!span})`
      );
    }
    return originalFunction.apply(ctx, originalArgs);
  }

  const { originalCallback, callbackIndex } = tracingUtil.findCallback(originalArgs);
  if (callbackIndex !== -1) {
    originalArgs[callbackIndex] = createWrappedCallback(span, originalCallback);
    return originalFunction.apply(ctx, originalArgs);
  }

  const resultPromise = originalFunction.apply(ctx, originalArgs);

  if (resultPromise && resultPromise.then) {
    resultPromise
      .then(result => {
        if (span) {
          span.d = Date.now() - span.ts;
          span.transmit();
        }
        return result;
      })
      .catch(err => {
        if (span) {
          span.ec = 1;
          tracingUtil.setErrorDetails(span, err, 'mongo');
          span.d = Date.now() - span.ts;
          span.transmit();
        }
        return err;
      });
  }

  return resultPromise;
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
