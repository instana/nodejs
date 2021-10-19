/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const shimmer = require('shimmer');

let logger;
logger = require('../../../logger').getLogger('tracing/graphql', newLogger => {
  logger = newLogger;
});

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

const queryOperationType = 'query';
const mutationOperationType = 'mutation';
const subscriptionOperationType = 'subscription';
const operationTypes = [queryOperationType, mutationOperationType, subscriptionOperationType];

const subscriptionUpdate = 'subscription-update';

exports.init = function init() {
  requireHook.onFileLoad(/\/graphql\/execution\/execute.js/, instrumentExecute);
  requireHook.onFileLoad(/\/@apollo\/gateway\/dist\/executeQueryPlan.js/, instrumentApolloGatewayExecuteQueryPlan);
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

    const originalThis = this;
    const originalArgs = arguments;
    let doc;
    let operationName;

    if (originalArgs.length === 1 && typeof originalArgs[0] === 'object') {
      doc = originalArgs[0].document;
      operationName = originalArgs[0].operationName;
    } else {
      doc = originalArgs[1];
      operationName = originalArgs[5];
    }

    const operationDefinition = findOperationDefinition(doc, operationName);
    if (!operationDefinition) {
      logger.debug('No operation definition, GraphQL call will not be traced.');
      return originalFunction.apply(this, arguments);
    }
    if (!operationDefinition.operation) {
      logger.debug(
        `Operation definition has no operation, GraphQL call will not be traced. ${JSON.stringify(operationDefinition)}`
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
  const activeEntrySpan = cls.getCurrentSpan();
  let span;
  if (activeEntrySpan && activeEntrySpan.k === constants.ENTRY && activeEntrySpan.n !== 'graphql.server') {
    // For now, we assume that the GraphQL operation is the only relevant operation that is happening while processing
    // the incoming request.
    //
    // With these assumptions in mind, we overwrite the entry span that has already been started (if any) and turn it
    // into a GraphQL entry span.
    //
    // HTTP is by far the most common transport for GraphQL, but others are possible and are actually used (AMQP for
    // example) (GraphQL is transport-layer agnostic).
    //
    // Possible consequences:
    // 1) If a customer does GraphQL over any transport that we trace as an entry, we will repurpose this
    // transport/protocol level entry span to a GraphQL entry by overwriting span.n. The attributes captured by the
    // protocol level tracing (the initial timestamp and for example HTTP attributes like url and method) will be kept.
    // But if the customer is using a transport that we do _not_ trace, we will start a new root entry span here. We
    // will still trace the GraphQL entry but might lose trace continuity, as X-Instana-T andX-Instana-S are not
    // transported at the GraphQL layer but rather in the underlying transport layer (HTTP, AMQP, ...)
    //
    // 2) If a customer does multiple things in an HTTP, AMQP, GRPc, ... call, only one of which is running a GraphQL
    // query, it is possible that they would rather see this call as the HTTP/AMQP/GRPc/... call instead of a GraphQL
    // call. But since we give GraphQL preference over protocol level entry spans, it will show up as a GraphQL call.

    // Replace generic node.http.server/rabbitmq/... span by a more specific graphql.server span. We change the values
    // in the active span in-situ. This way, other intermediate and exit spans that have already been created as
    // children of the current entry span still have the the correct parent span ID.
    span = activeEntrySpan;
    span.n = 'graphql.server';

    // Mark this span so that the GraphQL instrumentation will not transmit it, instead we wait for the protocol level
    // instrumentation to finish, which will then transmit it. This will ensure that we also capture attributes that are
    // only written by the protocol level instrumentation at the end (like the HTTP status code).
    // (This property is defined as non-enumerable in the InstanaSpan class and will not be serialized to JSON.)
    span.postponeTransmit = true;
  }

  return cls.ns.runAndReturn(() => {
    if (!span) {
      // If there hasn't been an entry span that we repurposed into a graphql.server entry span, we need to start a new
      // root entry span here.
      span = cls.startSpan('graphql.server', constants.ENTRY);
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
  const parentSpan = cls.getCurrentSpan() || cls.getReducedSpan();
  if (parentSpan && !constants.isExitSpan(parentSpan) && parentSpan.t && parentSpan.s) {
    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan('graphql.client', constants.EXIT, parentSpan.t, parentSpan.s);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(stackTraceRef);
      span.data.graphql = {
        operationType: subscriptionUpdate,
        operationName: operationDefinition.name ? operationDefinition.name.value : operationName,
        fields: {},
        args: {}
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
        .filter(definition => operationTypes.indexOf(definition.operation) !== -1)
        .find(definition => {
          const name = definition.name ? definition.name.value : null;
          return name && operationNameFromArgs === name;
        });
    } else {
      return doc.definitions.find(definition => operationTypes.indexOf(definition.operation) !== -1);
    }
  }
  return null;
}

function addFieldsAndArguments(span, definition) {
  traverseSelections(definition, entities => {
    entities.forEach(function (entity) {
      const entityName = entity.name.value;
      traverseSelections(entity, fields => {
        span.data.graphql.fields[entityName] = fields.map(field => field.name.value);
      });

      if (Array.isArray(entity.arguments) && entity.arguments.length > 0) {
        span.data.graphql.args[entityName] = entity.arguments.map(arg =>
          arg.name && typeof arg.name.value === 'string' ? arg.name.value : '?'
        );
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
  const candidates = definition.selectionSet.selections.filter(
    selection => selection && selection.kind === 'Field' && selection.name && typeof selection.name.value === 'string'
  );

  return selectionPostProcessor(candidates);
}

function runOriginalAndFinish(originalFunction, originalThis, originalArgs, span) {
  let result;
  try {
    result = originalFunction.apply(originalThis, originalArgs);
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
      promiseResult => {
        finishSpan(span, promiseResult);
        return promiseResult;
      },
      err => {
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
  span.ec = result.errors && result.errors.length >= 1 ? 1 : 0;
  span.d = Date.now() - span.ts;
  if (Array.isArray(result.errors)) {
    span.data.graphql.errors = result.errors
      .map(singleError => (typeof singleError.message === 'string' ? singleError.message : null))
      .filter(msg => !!msg)
      .join(', ');
  }
  if (!span.postponeTransmit && !span.postponeTransmitApolloGateway) {
    span.transmit();
  }
}

function finishWithException(span, err) {
  span.ec = 1;
  span.d = Date.now() - span.ts;
  span.data.graphql.errors = err.message;
  if (!span.postponeTransmit) {
    span.transmit();
  }
}

function instrumentApolloGatewayExecuteQueryPlan(apolloGatewayExecuteQueryPlanModule) {
  shimmer.wrap(
    apolloGatewayExecuteQueryPlanModule,
    'executeQueryPlan',
    shimApolloGatewayExecuteQueryPlanFunction.bind(null)
  );
}

function shimApolloGatewayExecuteQueryPlanFunction(originalFunction) {
  return function instrumentedExecuteQueryPlan() {
    if (!isActive || cls.tracingSuppressed()) {
      return originalFunction.apply(this, arguments);
    }
    const activeEntrySpan = cls.getCurrentSpan();
    if (activeEntrySpan && activeEntrySpan.k === constants.ENTRY) {
      // Most of the heavy lifting to trace Apollo Federation gateways (implemented by @apollo/gateway) is done by our
      // standard GraphQL tracing, because those gateway queries are all also run through normal resolvers, which we
      // instrument. There is one case that requires extra instrumentation, though. @apollo/gateway does something funky
      // with errors that come back from individual services: We would normally finish and transmit the span in
      // shimExecuteFunction/traceQueryOrMutation/runOriginalAndFinish, but when Apollo Gateway is involved the errors
      // (if any) are not part of the response. Therefore we mark the span so that transmitting it will be postponed,
      // that is, it won't happen in runOriginalAndFinish. Once the call returns from @apollo/gateway#executeQueryPlan
      // the errors have been merged back into the response and only then will we record the errors and finally transmit
      // the span. This is implemented via the marker property postponeTransmitApolloGateway.
      // (This property is defined as non-enumerable in the InstanaSpan class and will not be serialized to JSON.)
      activeEntrySpan.postponeTransmitApolloGateway = true;
    }

    const resultPromise = originalFunction.apply(this, arguments);
    if (resultPromise && typeof resultPromise.then === 'function') {
      return resultPromise.then(
        promiseResult => {
          delete activeEntrySpan.postponeTransmitApolloGateway;
          finishSpan(activeEntrySpan, promiseResult);
          return promiseResult;
        },
        err => {
          delete activeEntrySpan.postponeTransmitApolloGateway;
          finishWithException(activeEntrySpan, err);
          throw err;
        }
      );
    }
    return resultPromise;
  };
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function () {
  isActive = false;
};
