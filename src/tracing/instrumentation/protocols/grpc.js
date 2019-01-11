'use strict';

var shimmer = require('shimmer');

var logger;
logger = require('../../../logger').getLogger('tracing/grpc', function(newLogger) {
  logger = newLogger;
});

var requireHook = require('../../../util/requireHook');
var tracingConstants = require('../../constants');
var tracingUtil = require('../../tracingUtil');
var cls = require('../../cls');

var Metadata;
var isActive = false;

var typeUnary = 'unary';
var typeServerStream = 'server_stream';
var typeClientStream = 'client_stream';
var typeBidi = 'bidi';

var supportedTypes = [typeUnary, typeServerStream, typeClientStream, typeBidi];
var typesWithCallback = [typeUnary, typeClientStream];
var typesWithCallEnd = [typeServerStream, typeBidi];

exports.init = function() {
  requireHook.onModuleLoad('grpc', instrumentGrpc);
  requireHook.onFileLoad(/\/grpc\/src\/server\.js/, instrumentServer);
  requireHook.onFileLoad(/\/grpc\/src\/client\.js/, instrumentClient);
};

function instrumentGrpc(grpc) {
  Metadata = grpc.Metadata;
}

function instrumentServer(serverModule) {
  shimmer.wrap(serverModule.Server.prototype, 'register', shimServerRegister);
}

function shimServerRegister(originalFunction) {
  return function(name, handler, serialize, deserialize, type) {
    if (supportedTypes.indexOf(type) < 0) {
      logger.warn('Failed to instrument GRPC entry ' + name + ', type is unsupported: ' + type);
      return originalFunction.apply(this, arguments);
    }
    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    // wrap handler for service method that is being registered
    var originalHandler = originalArgs[1];
    originalArgs[1] = createInstrumentedServerHandler(name, type, originalHandler);
    return originalFunction.apply(this, originalArgs);
  };
}

function createInstrumentedServerHandler(name, type, originalHandler) {
  return function(call) {
    var originalThis = this;
    var originalArgs = arguments;
    return cls.ns.runAndReturn(function() {
      var metadata = call.metadata;
      var level = readMetadata(metadata, tracingConstants.traceLevelHeaderName);
      if (level === '0') {
        cls.setTracingLevel('0');
      }
      if (!isActive || cls.tracingSuppressed()) {
        return originalHandler.apply(originalThis, originalArgs);
      }

      cls.ns.bindEmitter(call);

      var incomingTraceId = readMetadata(metadata, tracingConstants.traceIdHeaderName);
      var incomingSpanId = readMetadata(metadata, tracingConstants.spanIdHeaderName);
      var span = cls.startSpan('rpc-server', cls.ENTRY, incomingTraceId, incomingSpanId);
      span.data = {
        rpc: {
          call: dropLeadingSlash(name),
          flavor: 'grpc'
        }
      };
      if (typesWithCallback.indexOf(type) >= 0) {
        var originalCallback = originalArgs[1];
        originalArgs[1] = cls.ns.bind(function(err) {
          if (err) {
            span.error = true;
            span.ec = 1;
            if (err.message || err.details) {
              span.data.rpc.error = err.message || err.details;
            }
          }
          span.d = Date.now() - span.ts;
          span.transmit();
          return originalCallback.apply(this, arguments);
        });
      }
      if (typesWithCallEnd.indexOf(type) >= 0) {
        var originalEnd = call.end;
        call.end = function() {
          span.d = Date.now() - span.ts;
          process.nextTick(function() {
            // If the server emits an error, grpc calls call.end before the 'error' event handlers are processed, so we
            // give on('error') a chance to fire and mark the span erroneous before transmitting it.
            span.transmit();
          });
          return originalEnd.apply(this, arguments);
        };
        call.on('error', function(err) {
          span.error = true;
          span.ec = 1;
          if (err.message || err.details) {
            span.data.rpc.error = err.message || err.details;
          }
        });
        call.on('cancelled', function() {
          span.d = Date.now() - span.ts;
          span.transmit();
        });
      }
      return originalHandler.apply(originalThis, originalArgs);
    });
  };
}

function instrumentClient(clientModule) {
  // One would think that doing
  // shimmer.wrap(clientModule.Client.prototype, 'makeUnaryRequest', shimMakeUnaryRequest) etc.
  // might be a convenient way to hook into the GRPC client, but the client stubs are created in such a way via lodash
  // that functions like Client.prototype.makeUnaryRequest are not called on the Client object, thus shimming it (that
  // is, replacing it with a wrapper on Client.prototype) is ineffective.
  shimmer.wrap(clientModule, 'makeClientConstructor', instrumentedMakeClientConstructor);
}

function instrumentedMakeClientConstructor(originalFunction) {
  return function(methods) {
    var ServiceClient = originalFunction.apply(this, arguments);
    Object.keys(methods).forEach(function(name) {
      var methodDefinition = methods[name];
      var rpcPath = methodDefinition.path;
      var shimFn = shimClientMethod.bind(
        null,
        rpcPath,
        methodDefinition.requestStream,
        methodDefinition.responseStream
      );
      shimmer.wrap(ServiceClient.prototype, name, shimFn);
      // the method is usually available under two identifiers, `name` (starting with a lower case letter) and
      // `originalName` (beginning with an upper case letter). We need to shim both identifiers.
      if (methodDefinition.originalName) {
        shimmer.wrap(ServiceClient.prototype, methodDefinition.originalName, shimFn);
      }
    });
    return ServiceClient;
  };
}

function shimClientMethod(rpcPath, requestStream, responseStream, originalFunction) {
  return function() {
    var parentSpan = cls.getCurrentSpan();
    var isTracing = isActive && cls.isTracing() && parentSpan && cls.isEntrySpan(parentSpan);
    var isSuppressed = cls.tracingLevel() === '0';
    if (isTracing || isSuppressed) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }

      if (isTracing) {
        return instrumentedClientMethod(this, originalFunction, originalArgs, rpcPath, requestStream, responseStream);
      } else {
        // Suppressed: We don't want to trace this call but we need to propagate the x-instana-l=0 header.
        modifyArgs(originalArgs); // add x-instana-l: 0 to metadata
        return originalFunction.apply(this, originalArgs);
      }
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedClientMethod(ctx, originalFunction, originalArgs, rpcPath, requestStream, responseStream) {
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('rpc-client', cls.EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedClientMethod);
    span.data = {
      rpc: {
        call: dropLeadingSlash(rpcPath),
        flavor: 'grpc'
      }
    };

    modifyArgs(originalArgs, span, responseStream);

    var call = originalFunction.apply(ctx, originalArgs);
    if (requestStream || responseStream) {
      cls.ns.bindEmitter(call);
    }
    if (responseStream) {
      call.on('end', function() {
        span.d = Date.now() - span.ts;
        span.transmit();
      });
      call.on('error', function(err) {
        span.d = Date.now() - span.ts;
        var errorMessage = err.details || err.message;
        if (errorMessage !== 'Cancelled') {
          span.error = true;
          span.ec = 1;
          if (errorMessage) {
            span.data.rpc.error = errorMessage;
          }
        }
        span.transmit();
      });
    }
    return call;
  });
}

/**
 * Must only be called if we are actively tracing (there is an active entry parent) or tracing is explicitly suppressed
 * (incoming call had x-instana-l = '0'). In the former case we expect the GRPC span in the making to be passed. The
 * GRPC result callback is wrapped and we add all three x-instana tracing headers. In the latter case (span is null or
 * undefined), we just add x-instana-l: '0'.
 *
 * If responseStream is true, there is no response callback, we listen for the 'end' event instead (only relevant if
 * we are tracing, that is, span != null).
 */
function modifyArgs(originalArgs, span, responseStream) {
  // find callback and metadata in original arguments
  var callbackIndex = -1;
  var metadataIndex = -1;
  for (var i = originalArgs.length - 1; i >= 0; i--) {
    if (originalArgs[i] && originalArgs[i].constructor && originalArgs[i].constructor.name === 'Metadata') {
      metadataIndex = i;
    }
    // If the response is streamed there ought to be no callback. If if it was passed, it won't be called, so in this
    // case we ignore all function arguments.
    if (!responseStream && typeof originalArgs[i] === 'function') {
      callbackIndex = i;
    }
  }

  // callbackIndex will only be >= 0 if !responseStream
  if (span && callbackIndex >= 0) {
    // we are tracing, so we wrap the original callback to get notified when the GRPC call finishes
    var originalCallback = originalArgs[callbackIndex];
    originalArgs[callbackIndex] = cls.ns.bind(function(err) {
      span.d = Date.now() - span.ts;
      if (err) {
        var errorMessage = err.details || err.message;
        if (errorMessage !== 'Cancelled') {
          span.error = true;
          span.ec = 1;
          if (errorMessage) {
            span.data.rpc.error = errorMessage;
          }
        }
      }
      span.transmit();
      originalCallback.apply(this, arguments);
    });
  }

  var metadata;
  if (metadataIndex >= 0) {
    metadata = originalArgs[metadataIndex];
  } else if (Metadata && callbackIndex >= 0) {
    // insert new metadata object as second to last argument, before the callback
    metadata = new Metadata();
    originalArgs.splice(callbackIndex, 0, metadata);
  } else if (Metadata) {
    // append new metadata object as last argument
    metadata = new Metadata();
    originalArgs.push(metadata);
  }

  if (span) {
    // we are actively tracing, so we add x-instana-t, x-instana-s and set x-instana-l: 1
    metadata.add(tracingConstants.spanIdHeaderName, span.s);
    metadata.add(tracingConstants.traceIdHeaderName, span.t);
    metadata.add(tracingConstants.traceLevelHeaderName, '1');
  } else {
    // tracing is suppressed, so we only set x-instana-l: 0
    metadata.add(tracingConstants.traceLevelHeaderName, '0');
  }
}

function readMetadata(metadata, key) {
  var values = metadata.get(key);
  if (values && values.length > 0) {
    return values[0];
  }
  return null;
}

function dropLeadingSlash(rpcPath) {
  if (typeof rpcPath === 'string') {
    if (rpcPath[0] === '/') {
      return rpcPath.substr(1);
    }
    return rpcPath;
  }
  return 'unknown';
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
