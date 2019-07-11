'use strict';

var shimmer = require('shimmer');

var logger;
logger = require('../../../logger').getLogger('tracing/graphql', function(newLogger) {
  logger = newLogger;
});

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

var isActive = false;

var queryOperationType = 'query';
var mutationOperationType = 'mutation';
var subscriptionOperationType = 'subscription';
var operationTypes = [queryOperationType, mutationOperationType, subscriptionOperationType];

var subscriptionUpdate = 'subscription-update';

exports.init = function() {
  requireHook.onFileLoad(/\/graphql\/execution\/execute.js/, instrumentExecute);
};

function instrumentExecute(executeModule) {
  shimmer.wrap(executeModule, 'execute', shimExecuteFunction.bind(null));
}

function shimExecuteFunction(originalFunction) {
  return function instrumentedExecute() {
    if (!isActive || cls.tracingSuppressed()) {
      // If this GraphQL query has been triggered by an HTTP request and it had X-INSTANA-L: 0, we have already set the
      // tracing level in the current cls context.
      return originalFunction.apply(this, arguments);
    }

    var originalThis = this;
    var originalArgs = arguments;
    var doc;
    var operationName;

    if (originalArgs.length === 1 && typeof originalArgs[0] === 'object') {
      doc = originalArgs[0].document;
      operationName = originalArgs[0].operationName;
    } else {
      doc = originalArgs[1];
      operationName = originalArgs[5];
    }

    var operationDefinition = findOperationDefinition(doc, operationName);
    if (!operationDefinition) {
      logger.debug('No operation definition, GraphQL call will not be traced.');
      return originalFunction.apply(this, arguments);
    }
    if (!operationDefinition.operation) {
      logger.debug(
        'Operation definition has no operation, GraphQL call will not be traced. ' + JSON.stringify(operationDefinition)
      );
      return originalFunction.apply(this, arguments);
    }

    if (operationDefinition.operation === subscriptionOperationType) {
      return traceSubscriptionUpdate(
        originalFunction,
        originalThis,
        originalArgs,
        instrumentedExecute,
        operationDefinition,
        operationName
      );
    } else {
      return traceQueryOrMutation(
        originalFunction,
        originalThis,
        originalArgs,
        instrumentedExecute,
        operationDefinition,
        operationName
      );
    }
  };
}

function traceQueryOrMutation(
  originalFunction,
  originalThis,
  originalArgs,
  stackTraceRef,
  operationDefinition,
  operationName
) {
  var activeEntrySpan = cls.getCurrentSpan();
  var span;
  if (activeEntrySpan) {
    if (activeEntrySpan.n === 'node.http.server') {
      // For now, we assume that
      // (a) all GraphQL entries we want to trace use HTTP as a transport protocol, and that
      // (b) the GraphQL operation is the only relevant operation that is happening while processing the incoming HTTP
      // request.
      //
      // With these assumptions in mind, we discard the HTTP entry span that has already been started and replace it
      // with a GraphQL entry span.
      //
      // Possible situations where this might have negative consequences:
      // 1) HTTP is by far the most common transport for GraphQL, but others are possible (GraphQL is transport-layer
      // agnostic). If a customer does GraphQL over, say, GRPc or some other transport that we trace as an entry, the
      // parent span will not be replaced and the call will show up as a generic GRPc call instead of a GraphQL call.
      // (If the customer is using a transport that we do _not_ trace, we will start a new root entry span here.)
      // 2) If a customer does multiple things in an HTTP call, only one of which is running a GraphQL query, they
      // would probably rather see this call as the HTTP call that it is instead of a GraphQL call. But since we give
      // GraphQL preference over HTTP, it will show up as a GraphQL call.

      // Replace generic node.http.server span by a more specific graphql.server span. We change the values in the
      // active span in-situ. This way, other exit spans that have already been created as children of the current entry
      // span still have the the correct parent span ID.
      span = activeEntrySpan;
      span.n = 'graphql.server';
      delete span.data.http;
    } else {
      logger.warn(
        'Cannot start a GraphQL entry span when another span is already active. Currently, the following span is ' +
          'active: ' +
          JSON.stringify(activeEntrySpan)
      );
      return originalFunction.apply(this, arguments);
    }
  }

  return cls.ns.runAndReturn(function() {
    if (!span) {
      // If there hasn't been an entry span that we repurposed into a graphql.server entry span, we need to start a new
      // root entry span here.
      span = cls.startSpan('graphql.server', constants.ENTRY);
      span.ts = Date.now();
      span.data = {};
    }
    span.stack = tracingUtil.getStackTrace(stackTraceRef);
    span.data.graphql = {
      operationType: operationDefinition.operation,
      operationName: operationDefinition.name ? operationDefinition.name.value : operationName,
      fields: {},
      args: {}
    };
    addFieldsAndArguments(span, operationDefinition);

    return runOriginalAndFinish(originalFunction, originalThis, originalArgs, span);
  });
}

function traceSubscriptionUpdate(
  originalFunction,
  originalThis,
  originalArgs,
  stackTraceRef,
  operationDefinition,
  operationName
) {
  if (!isActive) {
    return originalFunction.apply(originalThis, originalArgs);
  }
  var parentSpan = cls.getCurrentSpan() || cls.getReducedSpan();
  if (parentSpan && !constants.isExitSpan(parentSpan) && parentSpan.t && parentSpan.s) {
    return cls.ns.runAndReturn(function() {
      var span = cls.startSpan('graphql.client', constants.EXIT, parentSpan.t, parentSpan.s);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(stackTraceRef);
      span.data = {
        graphql: {
          operationType: subscriptionUpdate,
          operationName: operationDefinition.name ? operationDefinition.name.value : operationName,
          fields: {},
          args: {}
        }
      };
      addFieldsAndArguments(span, operationDefinition);
      return runOriginalAndFinish(originalFunction, originalThis, originalArgs, span);
    });
  } else {
    return originalFunction.apply(originalThis, originalArgs);
  }
}

function findOperationDefinition(doc, operationNameFromArgs) {
  if (doc && Array.isArray(doc.definitions)) {
    if (operationNameFromArgs) {
      return doc.definitions
        .filter(function(definition) {
          return operationTypes.indexOf(definition.operation) !== -1;
        })
        .find(function(definition) {
          var name = definition.name ? definition.name.value : null;
          return name && operationNameFromArgs === name;
        });
    } else {
      return doc.definitions.find(function(definition) {
        return operationTypes.indexOf(definition.operation) !== -1;
      });
    }
  }
  return null;
}

function addFieldsAndArguments(span, definition) {
  traverseSelections(definition, function(entities) {
    entities.forEach(function(entity) {
      var entityName = entity.name.value;
      traverseSelections(entity, function(fields) {
        span.data.graphql.fields[entityName] = fields.map(function(field) {
          return field.name.value;
        });
      });

      if (Array.isArray(entity.arguments) && entity.arguments.length > 0) {
        span.data.graphql.args[entityName] = entity.arguments.map(function(arg) {
          return arg.name && typeof arg.name.value === 'string' ? arg.name.value : '?';
        });
      }
    });
  });
}

function traverseSelections(definition, selectionPostProcessor) {
  if (
    !definition.selectionSet ||
    typeof definition.selectionSet !== 'object' ||
    !Array.isArray(definition.selectionSet.selections)
  ) {
    return null;
  }
  var candidates = definition.selectionSet.selections.filter(function(selection) {
    return selection && selection.kind === 'Field' && selection.name && typeof selection.name.value === 'string';
  });

  return selectionPostProcessor(candidates);
}

function runOriginalAndFinish(originalFunction, originalThis, originalArgs, span) {
  try {
    var result = originalFunction.apply(originalThis, originalArgs);
  } catch (e) {
    // A synchronous exception happened when resolving the GraphQL query, finish immediately.
    finishWithException(span, e);
    return result;
  }

  // A graphql resolver can yield a value, a promise or an array of promises. Fortunately, the "array of promises"
  // case is handled internally (the array is merged into one promise) so we only need to differntiate between
  // the promise and value cases.
  if (result && typeof result.then === 'function') {
    return result.then(
      function(promiseResult) {
        finishSpan(span, promiseResult);
        return promiseResult;
      },
      function(err) {
        finishWithException(span, err);
        throw err;
      }
    );
  } else {
    // The GraphQL operation returned a value instead of a promise - that means, the resolver finished synchronously. We
    // can finish the span immediately.
    finishSpan(span, result);
    return result;
  }
}

function finishSpan(span, result) {
  span.ec = result.errors ? result.errors.length : 0;
  span.error = span.ec > 0;
  if (Array.isArray(result.errors)) {
    span.data.graphql.errors = result.errors
      .map(function(singleError) {
        return typeof singleError.message === 'string' ? singleError.message : null;
      })
      .filter(function(msg) {
        return !!msg;
      })
      .join(', ');
  }
  span.transmit();
}

function finishWithException(span, err) {
  span.ec = 1;
  span.error = true;
  span.data.graphql.errors = err.message;
  span.transmit();
}
exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
