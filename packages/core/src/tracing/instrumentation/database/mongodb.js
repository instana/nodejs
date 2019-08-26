'use strict';

var logger;
logger = require('../../../logger').getLogger('tracing/mongodb', function(newLogger) {
  logger = newLogger;
});

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

var isActive = false;

// {
//   [requestId]: clsContext
// }
var clsContextMap = {};

// {
//   [requestId]: span
// }
var mongoDbSpansInProgress = {};

exports.init = function() {
  requireHook.onModuleLoad('mongodb', instrument);
};

var supportsOperationIds = false;
var apmConfig = {
  operationIdGenerator: {
    operationId: {},

    next: function() {
      return {};
    }
  },

  timestampGenerator: {
    current: function() {
      return Date.now();
    },

    duration: function(start, end) {
      return end - start;
    }
  }
};

function instrument(mongodb) {
  if (!mongodb.instrument) {
    logger.info('Cannot instrument the MongoDB driver as it is lacking APM support.');
    return;
  }

  // Note: The apmConfig parameter will be ignored beginning with version 3.0.6 of the mongodb package.
  // operationIdGenerator/operationId are no longer supported, thus we cannot rely on the events having the operationId
  // property but still make use of it in versions that have them.
  var listener = mongodb.instrument(apmConfig, function(error) {
    if (error) {
      logger.warn('Failed to instrument MongoDB', { error: error });
    }
  });

  listener.on('started', onStarted);
  listener.on('succeeded', onSucceeded);
  listener.on('failed', onFailed);
}

function onStarted(event) {
  if (!isActive) {
    return;
  }

  if (supportsOperationIds && !event.operationId) {
    return;
  }

  var parentSpan = cls.getCurrentSpan();
  if (!parentSpan || constants.isExitSpan(parentSpan)) {
    return;
  }

  var traceId;
  var parentSpanId;
  // event.operationId is only present prior to mongodb package version 3.0.6, see above.
  if (event.operationId) {
    traceId = event.operationId.traceId;
    parentSpanId = event.operationId.parentSpanId;
    supportsOperationIds = true;
  }

  if (traceId == null || parentSpanId == null) {
    // either event.operationId has not been present or event.operationId did not have a traceId/parentSpanId set.
    traceId = parentSpan.t;
    parentSpanId = parentSpan.s;
  }

  if (traceId == null || parentSpanId == null) {
    // We could not find the trace ID/parent span ID, neither via the operation ID mechanism nor the getCurrentSpan()
    // way - give up.
    return;
  }

  cls.ns.run(function(clsContext) {
    var span = cls.startSpan('mongo', constants.EXIT, traceId, parentSpanId, false);

    var peer = null;
    var service = null;
    if (event.connectionId && (event.connectionId.host || event.connectionId.port)) {
      peer = {
        hostname: event.connectionId.host,
        port: event.connectionId.port
      };
      service = event.connectionId.host + ':' + event.connectionId.port;
    } else if (typeof event.connectionId === 'string') {
      peer = parseConnectionToPeer(event.connectionId);
      service = event.connectionId;
    }
    var database = event.databaseName;
    var collection = event.command.collection || event.command[event.commandName];

    // using the Mongodb instrumentation API, it is not possible to gather stack traces.
    span.stack = [];
    span.data = {
      peer: peer,
      mongo: {
        command: event.commandName,
        service: service,
        namespace: database + '.' + collection,
        json: readJsonFromEvent(event),
        filter: stringifyWhenNecessary(event.command.filter),
        query: stringifyWhenNecessary(event.command.query)
      }
    };

    if (event.operationId) {
      event.operationId.traceId = span.t;
      event.operationId.parentSpanId = span.p;
    }

    var requestId = getUniqueRequestId(event);
    clsContextMap[requestId] = clsContext;
    mongoDbSpansInProgress[requestId] = span;
  });
}

function readJsonFromEvent(event) {
  if (event.commandName === 'update' && event.command.updates && typeof event.command.updates === 'object') {
    return tracingUtil.shortenDatabaseStatement(JSON.stringify(event.command.updates));
  } else if (event.commandName === 'delete' && event.command.deletes && typeof event.command.deletes === 'object') {
    return tracingUtil.shortenDatabaseStatement(JSON.stringify(event.command.deletes));
  } else if (event.command.update && typeof event.command.update === 'object') {
    // for findAndModify/findAndRemove
    return tracingUtil.shortenDatabaseStatement(JSON.stringify(event.command.update));
  }
  return undefined;
}

function stringifyWhenNecessary(obj) {
  if (obj == null) {
    return undefined;
  } else if (typeof obj === 'string') {
    return tracingUtil.shortenDatabaseStatement(obj);
  }
  return tracingUtil.shortenDatabaseStatement(JSON.stringify(obj));
}

function onSucceeded(event) {
  if (!isActive) {
    cleanup(event);
    return;
  }

  var requestId = getUniqueRequestId(event);
  var clsContext = clsContextMap[requestId];
  if (!clsContext) {
    cleanup(event);
    return;
  }

  // Make sure follow up calls (especially after batch calls) are executed in the same cls context, so that the root
  // span can be found.
  cls.ns.enter(clsContext);
  try {
    var span = mongoDbSpansInProgress[requestId];
    if (!span) {
      return;
    }

    span.d = Date.now() - span.ts;
    span.error = false;
    span.transmit();
  } finally {
    cleanup(event);
    setImmediate(function() {
      cls.ns.exit(clsContext);
    });
  }
}

function onFailed(event) {
  if (!isActive) {
    cleanup(event);
    return;
  }

  var requestId = getUniqueRequestId(event);
  var clsContext = clsContextMap[requestId];
  if (!clsContext) {
    cleanup(event);
    return;
  }

  // Make sure follow up calls (especially after batch calls) are executed in the same cls context, so that the root
  // span can be found.
  cls.ns.enter(clsContext);
  try {
    var span = mongoDbSpansInProgress[requestId];
    if (!span) {
      return;
    }

    span.d = Date.now() - span.ts;
    span.error = true;
    span.ec = 1;
    span.transmit();
  } finally {
    cleanup(event);
    setImmediate(function() {
      cls.ns.exit(clsContext);
    });
  }
}

function getUniqueRequestId(event) {
  return event.commandName + event.requestId;
}

function cleanup(event) {
  var requestId = getUniqueRequestId(event);
  delete mongoDbSpansInProgress[requestId];
  delete clsContextMap[requestId];
}

function parseConnectionToPeer(connectionString) {
  if (!connectionString) {
    return {
      hostname: null,
      port: null
    };
  }

  var i = connectionString.indexOf(':');
  if (i >= 0) {
    var portStr = connectionString.substr(i + 1, connectionString.length);
    try {
      return {
        hostname: connectionString.substr(0, i),
        port: parseInt(portStr, 10)
      };
    } catch (_) {
      return {
        hostname: connectionString,
        port: 27017
      };
    }
  } else {
    return {
      hostname: connectionString,
      port: 27017
    };
  }
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
