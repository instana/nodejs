/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const shimmer = require('../../shimmer');

const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
// const hook = require('../../../util/hook');
const cls = require('../../cls');

let isActive = false;

// const commands = [
//   //
//   'aggregate',
//   'count',
//   'delete',
//   'distinct',
//   'find',
//   'findAndModify',
//   'findandmodify',
//   'getMore',
//   'getmore',
//   'insert',
//   'update'
// ];

exports.spanName = 'mongo';
exports.batchable = true;

exports.init = function init() {
  // unified topology layer
  // hook.onFileLoad(/\/mongodb\/lib\/cmap\/connection\.js/, instrumentCmapConnection);
  // mongodb >= 3.3.x, legacy topology layer
  // hook.onFileLoad(/\/mongodb\/lib\/core\/connection\/pool\.js/, instrumentLegacyTopologyPool);
  // mongodb < 3.3.x, legacy topology layer
  // hook.onFileLoad(/\/mongodb-core\/lib\/connection\/pool\.js/, instrumentLegacyTopologyPool);
  tryPatchMongoDBDirectly();
};

function tryPatchMongoDBDirectly() {
  try {
    const resolvedPath = require.resolve('mongodb');
    const mongodb = require(resolvedPath);

    // Works with v7! Works with v3!
    if (mongodb.Collection && mongodb.Collection.prototype) {
      instrumentCollection(mongodb.Collection);
    }

    if (require.cache[resolvedPath]) {
      require.cache[resolvedPath].exports = mongodb;
    }
  } catch (e) {
    // mongodb not installed or not loadable
  }
}

function instrumentCollection(Collection) {
  const methods = [
    'insertOne',
    'insertMany',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'findOne',
    'findOneAndUpdate',
    'findOneAndReplace',
    'findOneAndDelete',
    'replaceOne',
    'countDocuments',
    'estimatedDocumentCount',
    'distinct',
    'bulkWrite'
  ];

  methods.forEach(method => {
    if (Collection.prototype[method]) {
      shimmer.wrap(Collection.prototype, method, shimCollectionMethod.bind(null, method));
    }
  });

  // find() and aggregate() return cursors, need special handling
  if (Collection.prototype.find) {
    shimmer.wrap(Collection.prototype, 'find', shimFindMethod);
  }
  if (Collection.prototype.aggregate) {
    shimmer.wrap(Collection.prototype, 'aggregate', shimAggregateMethod);
  }
}

function shimCollectionMethod(method, original) {
  return function () {
    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedCollectionMethod(this, original, originalArgs, method);
  };
}

function shimFindMethod(original) {
  return function () {
    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    const ctx = this;
    const cursor = original.apply(this, originalArgs);

    // Wrap toArray to capture the span
    const originalToArray = cursor.toArray;
    cursor.toArray = function (callback) {
      if (cls.skipExitTracing({ isActive })) {
        return originalToArray.apply(this, arguments);
      }

      return instrumentedCursorToArray(ctx, cursor, originalToArray, originalArgs, 'find', callback);
    };

    return cursor;
  };
}

function shimAggregateMethod(original) {
  return function () {
    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    const ctx = this;
    const cursor = original.apply(this, originalArgs);

    // Wrap toArray to capture the span
    const originalToArray = cursor.toArray;
    cursor.toArray = function (callback) {
      if (cls.skipExitTracing({ isActive })) {
        return originalToArray.apply(this, arguments);
      }

      return instrumentedCursorToArray(ctx, cursor, originalToArray, originalArgs, 'aggregate', callback);
    };

    return cursor;
  };
}

function instrumentedCursorToArray(collectionCtx, cursor, originalToArray, originalArgs, command, callback) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT
    });

    span.stack = tracingUtil.getStackTrace(instrumentedCursorToArray, 1);

    let hostname;
    let port;
    let service;
    let database;
    let collection;
    let namespace;

    try {
      database = collectionCtx.s?.db?.databaseName || collectionCtx.dbName;
      collection = collectionCtx.collectionName || collectionCtx.s?.namespace?.collection;
    } catch (e) {
      // ignore
    }

    if (database && collection) {
      namespace = `${database}.${collection}`;
    } else if (database) {
      namespace = `${database}.?`;
    } else if (collection) {
      namespace = `?.${collection}`;
    }

    try {
      const topology =
        collectionCtx.s?.db?.serverConfig ||
        collectionCtx.s?.db?.s?.topology ||
        collectionCtx.s?.topology ||
        collectionCtx.s?.db?.s?.client?.topology;

      if (topology) {
        if (topology.s?.options) {
          hostname = topology.s.options.host;
          port = topology.s.options.port;

          if (!hostname && topology.s.options.servers && topology.s.options.servers[0]) {
            hostname = topology.s.options.servers[0].host;
            port = topology.s.options.servers[0].port;
          }
        }

        if (!hostname && topology.host) {
          hostname = topology.host;
        }
        if (!port && topology.port) {
          port = topology.port;
        }
      }
    } catch (e) {
      // ignore
    }

    if (hostname || port) {
      span.data.peer = { hostname, port };
    }

    if (hostname && port) {
      service = `${hostname}:${port}`;
    } else if (hostname) {
      service = `${hostname}:27017`;
    } else if (port) {
      service = `?:${port}`;
    }

    span.data.mongo = {
      command,
      service,
      namespace
    };

    if (command === 'find' && originalArgs[0]) {
      span.data.mongo.filter = stringifyWhenNecessary(originalArgs[0]);
    } else if (command === 'aggregate' && originalArgs[0]) {
      span.data.mongo.json = stringifyWhenNecessary(originalArgs[0]);
    }

    if (typeof callback === 'function') {
      return originalToArray.call(
        cursor,
        cls.ns.bind(function (error) {
          if (error) {
            span.ec = 1;
            span.data.mongo.error = tracingUtil.getErrorDetails(error);
          }
          span.d = Date.now() - span.ts;
          span.transmit();
          return callback.apply(this, arguments);
        })
      );
    }

    const promise = originalToArray.call(cursor);
    if (promise && promise.then) {
      promise
        .then(result => {
          span.d = Date.now() - span.ts;
          span.transmit();
          return result;
        })
        .catch(err => {
          span.ec = 1;
          span.data.mongo.error = tracingUtil.getErrorDetails(err);
          span.d = Date.now() - span.ts;
          span.transmit();
          return err;
        });
    }

    return promise;
  });
}

function instrumentedCollectionMethod(ctx, originalMethod, originalArgs, method) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT
    });

    span.stack = tracingUtil.getStackTrace(instrumentedCollectionMethod, 1);

    let hostname;
    let port;
    let service;
    let database;
    let collection;
    let namespace;

    try {
      database = ctx.s?.db?.databaseName || ctx.dbName;
      collection = ctx.collectionName || ctx.s?.namespace?.collection;
    } catch (e) {
      // ignore
    }

    if (database && collection) {
      namespace = `${database}.${collection}`;
    } else if (database) {
      namespace = `${database}.?`;
    } else if (collection) {
      namespace = `?.${collection}`;
    }

    // v3.x: get host/port from topology
    try {
      const topology =
        ctx.s?.db?.serverConfig || ctx.s?.db?.s?.topology || ctx.s?.topology || ctx.s?.db?.s?.client?.topology;

      if (topology) {
        if (topology.s?.options) {
          hostname = topology.s.options.host;
          port = topology.s.options.port;

          if (!hostname && topology.s.options.servers && topology.s.options.servers[0]) {
            hostname = topology.s.options.servers[0].host;
            port = topology.s.options.servers[0].port;
          }
        }

        if (!hostname && topology.host) {
          hostname = topology.host;
        }
        if (!port && topology.port) {
          port = topology.port;
        }
      }
    } catch (e) {
      // ignore
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
      service = `?:${port}`;
    }

    span.data.mongo = {
      command: method,
      service,
      namespace
    };

    if (method.indexOf('insert') < 0 && originalArgs[0]) {
      span.data.mongo.filter = stringifyWhenNecessary(originalArgs[0]);
    }

    return handleCallbackOrPromise(ctx, originalArgs, originalMethod, span);
  });
}

// function instrumentCmapConnection(connection) {
//   if (connection.Connection && connection.Connection.prototype) {
//     // v4, v5
//     if (!connection.Connection.prototype.query) {
//       shimmer.wrap(connection.Connection.prototype, 'command', shimCmapCommand);
//     } else {
//       // collection.findOne, collection.find et al.
//       shimmer.wrap(connection.Connection.prototype, 'query', shimCmapQuery);
//       // collection.count et al.
//       shimmer.wrap(connection.Connection.prototype, 'command', shimCmapCommand);

//       [
//         'insert', // collection.insertOne et al.
//         'update', // collection.replaceOne et al.
//         'remove' // collection.delete et al.
//       ].forEach(fnName => {
//         if (connection.Connection.prototype[fnName]) {
//           shimmer.wrap(connection.Connection.prototype, fnName, shimCmapMethod.bind(null, fnName));
//         }
//       });

//       shimmer.wrap(connection.Connection.prototype, 'getMore', shimCmapGetMore);
//     }
//   }
// }

// function shimCmapQuery(original) {
//   return function tmp() {
//     if (cls.skipExitTracing({ isActive })) {
//       return original.apply(this, arguments);
//     }

//     const originalArgs = new Array(arguments.length);
//     for (let i = 0; i < arguments.length; i++) {
//       originalArgs[i] = arguments[i];
//     }

//     return instrumentedCmapQuery(this, original, originalArgs);
//   };
// }

// function shimCmapCommand(original) {
//   return function () {
//     if (cls.skipExitTracing({ isActive })) {
//       return original.apply(this, arguments);
//     }

//     const command = arguments[1] && commands.find(c => arguments[1][c]);

//     if (!command) {
//       return original.apply(this, arguments);
//     }

//     const originalArgs = new Array(arguments.length);
//     for (let i = 0; i < arguments.length; i++) {
//       originalArgs[i] = arguments[i];
//     }

//     return instrumentedCmapMethod(this, original, originalArgs, command);
//   };
// }

// function shimCmapMethod(fnName, original) {
//   return function () {
//     if (cls.skipExitTracing({ isActive })) {
//       return original.apply(this, arguments);
//     }

//     const originalArgs = new Array(arguments.length);
//     for (let i = 0; i < arguments.length; i++) {
//       originalArgs[i] = arguments[i];
//     }

//     return instrumentedCmapMethod(this, original, originalArgs, fnName);
//   };
// }

// function shimCmapGetMore(original) {
//   return function () {
//     if (cls.skipExitTracing({ isActive })) {
//       return original.apply(this, arguments);
//     }

//     const originalArgs = new Array(arguments.length);
//     for (let i = 0; i < arguments.length; i++) {
//       originalArgs[i] = arguments[i];
//     }

//     return instrumentedCmapGetMore(this, original, originalArgs);
//   };
// }

// function instrumentedCmapQuery(ctx, originalQuery, originalArgs) {
//   return cls.ns.runAndReturn(() => {
//     const span = cls.startSpan({
//       spanName: exports.spanName,
//       kind: constants.EXIT
//     });
//     span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

//     const namespace = originalArgs[0];
//     const cmd = originalArgs[1];

//     let command;
//     if (cmd) {
//       command = findCommand(cmd);
//     }

//     let service;
//     if (ctx.address) {
//       service = ctx.address;
//       span.data.peer = splitIntoHostAndPort(ctx.address);
//     }

//     span.data.mongo = {
//       command,
//       service,
//       namespace
//     };

//     readJsonOrFilter(cmd, span);
//     return handleCallbackOrPromise(ctx, originalArgs, originalQuery, span);
//   });
// }

// function instrumentedCmapMethod(ctx, originalMethod, originalArgs, command) {
//   return cls.ns.runAndReturn(() => {
//     const span = cls.startSpan({
//       spanName: exports.spanName,
//       kind: constants.EXIT
//     });
//     span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

//     let namespace = originalArgs[0];

//     if (typeof namespace === 'object') {
//       // NOTE: Sometimes the collection name is "$cmd"
//       if (namespace.collection !== '$cmd') {
//         namespace = `${namespace.db}.${namespace.collection}`;
//       } else if (originalArgs[1] && typeof originalArgs[1] === 'object') {
//         const collName = originalArgs[1][command];
//         namespace = `${namespace.db}.${collName}`;
//       } else {
//         namespace = namespace.db;
//       }
//     }

//     let service;
//     if (ctx.address) {
//       service = ctx.address;
//       span.data.peer = splitIntoHostAndPort(ctx.address);
//     }

//     span.data.mongo = {
//       command,
//       service,
//       namespace
//     };

//     if (command && command.indexOf('insert') < 0) {
//       // we do not capture the document for insert commands
//       readJsonOrFilter(originalArgs[1], span);
//     }

//     return handleCallbackOrPromise(ctx, originalArgs, originalMethod, span);
//   });
// }

// function instrumentedCmapGetMore(ctx, originalMethod, originalArgs) {
//   return cls.ns.runAndReturn(() => {
//     const span = cls.startSpan({
//       spanName: exports.spanName,
//       kind: constants.EXIT
//     });
//     span.stack = tracingUtil.getStackTrace(instrumentedCmapQuery, 1);

//     const namespace = originalArgs[0];

//     let service;
//     if (ctx.address) {
//       service = ctx.address;
//       span.data.peer = splitIntoHostAndPort(ctx.address);
//     }

//     span.data.mongo = {
//       command: 'getMore',
//       service,
//       namespace
//     };

//     return handleCallbackOrPromise(ctx, originalArgs, originalMethod, span);
//   });
// }

// function instrumentLegacyTopologyPool(Pool) {
//   shimmer.wrap(Pool.prototype, 'write', shimLegacyWrite);
// }

// function shimLegacyWrite(original) {
//   return function () {
//     if (cls.skipExitTracing({ isActive })) {
//       return original.apply(this, arguments);
//     }

//     const originalArgs = new Array(arguments.length);
//     for (let i = 0; i < arguments.length; i++) {
//       originalArgs[i] = arguments[i];
//     }

//     return instrumentedLegacyWrite(this, original, originalArgs);
//   };
// }

// function instrumentedLegacyWrite(ctx, originalWrite, originalArgs) {
//   return cls.ns.runAndReturn(() => {
//     const span = cls.startSpan({
//       spanName: exports.spanName,
//       kind: constants.EXIT
//     });
//     span.stack = tracingUtil.getStackTrace(instrumentedLegacyWrite);

//     let hostname;
//     let port;
//     let service;
//     let command;
//     let database;
//     let collection;
//     let namespace;

//     const message = originalArgs[0];
//     if (message && typeof message === 'object') {
//       if (
//         message.options &&
//         message.options.session &&
//         message.options.session.topology &&
//         message.options.session.topology.s &&
//         message.options.session.topology.s
//       ) {
//         hostname = message.options.session.topology.s.host;
//         port = message.options.session.topology.s.port;
//       }

//       if ((!hostname || !port) && ctx.options) {
//         // fallback for older versions of mongodb package
//         if (!hostname) {
//           hostname = ctx.options.host;
//         }
//         if (!port) {
//           port = ctx.options.port;
//         }
//       }

//       let cmdObj = message.command;
//       if (!cmdObj) {
//         // fallback for older mongodb versions
//         cmdObj = message.query;
//       }
//       if (cmdObj) {
//         if (cmdObj.collection) {
//           // only getMore commands have the collection attribute
//           collection = cmdObj.collection;
//         }
//         if (!collection) {
//           collection = findCollection(cmdObj);
//         }
//         command = findCommand(cmdObj);
//         database = cmdObj.$db;
//       }

//       if (!database && typeof message.ns === 'string') {
//         // fallback for older mongodb versions
//         database = message.ns.split('.')[0];
//       }
//     }

//     if (database && collection) {
//       namespace = `${database}.${collection}`;
//     } else if (database) {
//       namespace = `${database}.?`;
//     } else if (collection) {
//       namespace = `?.${collection}`;
//     }

//     if (hostname || port) {
//       span.data.peer = {
//         hostname,
//         port
//       };
//     }

//     if (hostname && port) {
//       service = `${hostname}:${port}`;
//     } else if (hostname) {
//       service = `${hostname}:27017`;
//     } else if (port) {
//       service = '?:27017';
//     }

//     span.data.mongo = {
//       command,
//       service,
//       namespace
//     };

//     readJsonOrFilterFromMessage(message, span);
//     return handleCallbackOrPromise(ctx, originalArgs, originalWrite, span);
//   });
// }

// function findCollection(cmdObj) {
//   for (let j = 0; j < commands.length; j++) {
//     if (cmdObj[commands[j]] && typeof cmdObj[commands[j]] === 'string') {
//       // most commands (except for getMore) add the collection as the value for the command-specific key
//       return cmdObj[commands[j]];
//     }
//   }
// }

// function findCommand(cmdObj) {
//   for (let j = 0; j < commands.length; j++) {
//     if (cmdObj[commands[j]]) {
//       return commands[j];
//     }
//   }
// }

// function splitIntoHostAndPort(address) {
//   if (typeof address === 'string') {
//     let hostname;
//     let port;
//     if (address.indexOf(':') >= 0) {
//       const idx = address.indexOf(':');
//       hostname = address.substring(0, idx);
//       port = parseInt(address.substring(idx + 1), 10);
//       if (isNaN(port)) {
//         port = undefined;
//       }
//       return {
//         hostname,
//         port
//       };
//     } else {
//       return {
//         hostname: address
//       };
//     }
//   }
// }

// function readJsonOrFilterFromMessage(message, span) {
//   if (!message) {
//     return;
//   }
//   let cmdObj = message.command;
//   if (!cmdObj) {
//     cmdObj = message.query;
//   }
//   if (!cmdObj) {
//     return;
//   }
//   return readJsonOrFilter(cmdObj, span);
// }

// function readJsonOrFilter(cmdObj, span) {
//   let json;
//   if (Array.isArray(cmdObj) && cmdObj.length >= 1) {
//     json = cmdObj;
//   } else if (Array.isArray(cmdObj.updates) && cmdObj.updates.length >= 1) {
//     json = cmdObj.updates;
//   } else if (Array.isArray(cmdObj.deletes) && cmdObj.deletes.length >= 1) {
//     json = cmdObj.deletes;
//   } else if (Array.isArray(cmdObj.pipeline) && cmdObj.pipeline.length >= 1) {
//     json = cmdObj.pipeline;
//   }

//   // The back end will process exactly one of json, query, or filter, so it does not matter too much which one we
//   // provide.
//   if (json) {
//     span.data.mongo.json = stringifyWhenNecessary(json);
//   } else if (cmdObj.filter || cmdObj.query) {
//     span.data.mongo.filter = stringifyWhenNecessary(cmdObj.filter || cmdObj.query);
//   }
// }

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

function handleCallbackOrPromise(ctx, originalArgs, originalFunction, span) {
  const { originalCallback, callbackIndex } = tracingUtil.findCallback(originalArgs);
  if (callbackIndex !== -1) {
    originalArgs[callbackIndex] = createWrappedCallback(span, originalCallback);
    return originalFunction.apply(ctx, originalArgs);
  }

  const resultPromise = originalFunction.apply(ctx, originalArgs);

  if (resultPromise && resultPromise.then) {
    resultPromise
      .then(result => {
        span.d = Date.now() - span.ts;
        span.transmit();
        return result;
      })
      .catch(err => {
        span.ec = 1;
        span.data.mongo.error = tracingUtil.getErrorDetails(err);
        span.d = Date.now() - span.ts;
        span.transmit();
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
