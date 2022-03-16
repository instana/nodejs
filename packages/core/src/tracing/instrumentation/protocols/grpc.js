/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const util = require('util');
const shimmer = require('shimmer');

let logger;
logger = require('../../../logger').getLogger('tracing/grpc', newLogger => {
  logger = newLogger;
});

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let Metadata;
let isActive = false;

const typeUnary = 'unary';
const typeServerStream = 'server_stream';
const typeClientStream = 'client_stream';
const typeBidi = 'bidi';
const addressRegex = /^(.*):(\d+)$/;

const supportedTypes = [typeUnary, typeServerStream, typeClientStream, typeBidi];
const typesWithCallback = [typeUnary, typeClientStream];
const typesWithCallEnd = [typeServerStream, typeBidi];

exports.init = function () {
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
  return function (name, handler, serialize, deserialize, type) {
    if (supportedTypes.indexOf(type) < 0) {
      logger.warn(`Failed to instrument GRPC entry ${name}, type is unsupported: ${type}`);
      return originalFunction.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    // wrap handler for service method that is being registered
    const originalHandler = originalArgs[1];
    originalArgs[1] = createInstrumentedServerHandler(name, type, originalHandler);
    return originalFunction.apply(this, originalArgs);
  };
}

function createInstrumentedServerHandler(name, type, originalHandler) {
  return function (call) {
    const originalThis = this;
    const originalArgs = arguments;

    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        'Cannot start a GRPC entry span when another span is already active. Currently, the following span is ' +
          'active: ' +
          JSON.stringify(parentSpan)
      );
      return originalHandler.apply(originalThis, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const metadata = call.metadata;
      const level = readMetadata(metadata, constants.traceLevelHeaderName);
      if (level === '0') {
        cls.setTracingLevel('0');
      }
      if (!isActive || cls.tracingSuppressed()) {
        return originalHandler.apply(originalThis, originalArgs);
      }

      cls.ns.bindEmitter(call);

      const incomingTraceId = readMetadata(metadata, constants.traceIdHeaderName);
      const incomingSpanId = readMetadata(metadata, constants.spanIdHeaderName);
      const span = cls.startSpan('rpc-server', constants.ENTRY, incomingTraceId, incomingSpanId);
      span.data.rpc = {
        call: dropLeadingSlash(name),
        flavor: 'grpc'
      };
      if (typesWithCallback.indexOf(type) >= 0) {
        const originalCallback = originalArgs[1];
        originalArgs[1] = cls.ns.bind(function (err) {
          if (err) {
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
        const originalEnd = call.end;
        call.end = function () {
          span.d = Date.now() - span.ts;
          process.nextTick(() => {
            // If the server emits an error, grpc calls call.end before the 'error' event handlers are processed, so we
            // give on('error') a chance to fire and mark the span erroneous before transmitting it.
            span.transmit();
          });
          return originalEnd.apply(this, arguments);
        };
        call.on('error', err => {
          span.ec = 1;
          if (err.message || err.details) {
            span.data.rpc.error = err.message || err.details;
          }
        });
        call.on('cancelled', () => {
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
  shimmer.wrap(clientModule, 'makeClientConstructor', instrumentedMakeClientConstructor.bind(null, clientModule));
}

function instrumentedMakeClientConstructor(clientModule, originalFunction) {
  return function (methods) {
    const address = {
      host: undefined,
      port: undefined
    };
    const ServiceClient = originalFunction.apply(this, arguments);
    const InstrumentedServiceClient = function (addressString) {
      const parseResult = addressRegex.exec(addressString);
      if (parseResult && parseResult.length === 3) {
        address.host = parseResult[1];
        address.port = parseResult[2];
      }
      return ServiceClient.apply(this, arguments);
    };
    // grpc attaches extra properties to the client constructor which we need to copy over.
    copyAttributes(ServiceClient, InstrumentedServiceClient);
    // Make InstrumentedServiceClient prototypically inherit from ServiceClient.
    InstrumentedServiceClient.prototype = Object.create(ServiceClient.prototype);
    // Re-set the original constructor.
    InstrumentedServiceClient.prototype.constructor = InstrumentedServiceClient;

    Object.keys(methods).forEach(name => {
      const methodDefinition = methods[name];
      const rpcPath = methodDefinition.path;
      const shimFn = shimClientMethod.bind(
        null,
        address,
        rpcPath,
        methodDefinition.requestStream,
        methodDefinition.responseStream
      );
      shimmer.wrap(InstrumentedServiceClient.prototype, name, shimFn);
      // the method is usually available under two identifiers, `name` (starting with a lower case letter) and
      // `originalName` (beginning with an upper case letter). We need to shim both identifiers.
      if (methodDefinition.originalName) {
        shimmer.wrap(InstrumentedServiceClient.prototype, methodDefinition.originalName, shimFn);
      }
    });

    // ServiceClient inherits from grpc's base Client, make our instrumented version inherit from Client, too.
    util.inherits(InstrumentedServiceClient, clientModule.Client);

    return InstrumentedServiceClient;
  };
}

function shimClientMethod(address, rpcPath, requestStream, responseStream, originalFunction) {
  function shimmedFunction() {
    const parentSpan = cls.getCurrentSpan();
    const isTracing = isActive && cls.isTracing() && parentSpan && !constants.isExitSpan(parentSpan);
    const isSuppressed = cls.tracingLevel() === '0';
    if (isTracing || isSuppressed) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }

      if (isTracing) {
        return instrumentedClientMethod(
          this,
          originalFunction,
          originalArgs,
          address,
          rpcPath,
          requestStream,
          responseStream
        );
      } else {
        // Suppressed: We don't want to trace this call but we need to propagate the x-instana-l=0 header.
        modifyArgs(originalArgs); // add x-instana-l: 0 to metadata
        return originalFunction.apply(this, originalArgs);
      }
    }
    return originalFunction.apply(this, arguments);
  }
  return copyAttributes(originalFunction, shimmedFunction);
}

function instrumentedClientMethod(
  ctx,
  originalFunction,
  originalArgs,
  address,
  rpcPath,
  requestStream,
  responseStream
) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('rpc-client', constants.EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedClientMethod);
    span.data.rpc = {
      host: address.host,
      port: address.port,
      call: dropLeadingSlash(rpcPath),
      flavor: 'grpc'
    };

    modifyArgs(originalArgs, span, responseStream);

    const call = originalFunction.apply(ctx, originalArgs);
    if (requestStream || responseStream) {
      cls.ns.bindEmitter(call);
    }
    if (responseStream) {
      call.on('end', () => {
        span.d = Date.now() - span.ts;
        span.transmit();
      });
      call.on('error', err => {
        span.d = Date.now() - span.ts;
        const errorMessage = err.details || err.message;
        if (errorMessage !== 'Cancelled') {
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
  // Find callback, metadata and options in original arguments, the parameters can be:
  // (message, metadata, options, callback) but all of them except the message can be optional.
  // All of
  let metadataIndex = -1;
  let optionsIndex = -1;
  let callbackIndex = -1;
  for (let i = originalArgs.length - 1; i >= 0; i--) {
    if (originalArgs[i] && originalArgs[i].constructor && originalArgs[i].constructor.name === 'Metadata') {
      metadataIndex = i;
    } else if (!responseStream && typeof originalArgs[i] === 'function') {
      // If the response is streamed there ought to be no callback. If if it was passed, it won't be called, so in this
      // case we ignore all function arguments.
      callbackIndex = i;
    } else if (i > 0 && typeof originalArgs[i] === 'object') {
      optionsIndex = i;
    }
  }

  // callbackIndex will only be >= 0 if !responseStream
  if (span && callbackIndex >= 0) {
    // we are tracing, so we wrap the original callback to get notified when the GRPC call finishes
    const originalCallback = originalArgs[callbackIndex];
    originalArgs[callbackIndex] = cls.ns.bind(function (err) {
      span.d = Date.now() - span.ts;
      if (err) {
        const errorMessage = err.details || err.message;
        if (errorMessage !== 'Cancelled') {
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

  let metadata;
  if (metadataIndex >= 0) {
    // If metadata has been provided, modify the existing metadata object.
    metadata = originalArgs[metadataIndex];
  } else if (Metadata && optionsIndex >= 0) {
    // If options have been given but no metadata, insert the new metadata object directly before the options parameter.
    metadata = new Metadata();
    originalArgs.splice(optionsIndex, 0, metadata);
  } else if (Metadata && callbackIndex >= 0) {
    // If neither options nor metadata have been provided but a callback, insert the new metadata object directly
    // before the callback.
    metadata = new Metadata();
    originalArgs.splice(callbackIndex, 0, metadata);
  } else if (Metadata) {
    // If neither options nor metadata nor a callback have been provided, append the new metadata object as last
    // argument.
    metadata = new Metadata();
    originalArgs.push(metadata);
  }

  if (span && metadata) {
    // we are actively tracing, so we add x-instana-t, x-instana-s and set x-instana-l: 1
    metadata.set(constants.spanIdHeaderName, span.s);
    metadata.set(constants.traceIdHeaderName, span.t);
    metadata.set(constants.traceLevelHeaderName, '1');
  } else if (metadata) {
    // tracing is suppressed, so we only set x-instana-l: 0
    metadata.set(constants.traceLevelHeaderName, '0');
  }
}

function readMetadata(metadata, key) {
  // The grpc library normalizes keys internally to lower-case, so we do not need to take care of reading
  // them case-insensitive ourselves.
  const values = metadata.get(key);
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

function copyAttributes(from, to) {
  Object.keys(from).forEach(attribute => {
    to[attribute] = from[attribute];
  });
  return to;
}

exports.activate = function () {
  isActive = true;
};

exports.deactivate = function () {
  isActive = false;
};
