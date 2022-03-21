/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const shimmer = require('shimmer');

let logger;
logger = require('../../../logger').getLogger('tracing/grpcjs', newLogger => {
  logger = newLogger;
});

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let Metadata;
let isActive = false;

const TYPES = {
  UNARY: 'unary',
  SERVER_STREAM: 'serverStream',
  CLIENT_STREAM: 'clientStream',
  BIDI: 'bidi'
};

const ALL_TYPES = [TYPES.UNARY, TYPES.SERVER_STREAM, TYPES.CLIENT_STREAM, TYPES.BIDI];
const TYPES_WITH_CALLBACK = [TYPES.UNARY, TYPES.CLIENT_STREAM];
const TYPES_WITH_CALL_END = [TYPES.SERVER_STREAM, TYPES.BIDI];

exports.init = function () {
  requireHook.onModuleLoad('@grpc/grpc-js', instrumentModule);
  requireHook.onFileLoad(/\/@grpc\/grpc-js\/build\/src\/server\.js/, instrumentServer);
  requireHook.onFileLoad(/\/@grpc\/grpc-js\/build\/src\/client\.js/, instrumentClient);
};

function instrumentModule(grpc) {
  Metadata = grpc.Metadata;
}

function instrumentServer(serverModule) {
  shimmer.wrap(serverModule.Server.prototype, 'register', shimServerRegister);
}

function instrumentClient(clientModule) {
  let address;

  class ClientMock extends clientModule.Client {
    constructor(_address) {
      address = _address;
      super(...arguments);
    }
  }

  clientModule.Client = ClientMock;

  const fnArr = [
    { name: 'makeUnaryRequest', responseStream: false, requestStream: false },
    { name: 'makeServerStreamRequest', responseStream: true, requestStream: false },
    { name: 'makeClientStreamRequest', responseStream: false, requestStream: true },
    { name: 'makeBidiStreamRequest', responseStream: true, requestStream: true }
  ];

  fnArr.forEach(fnObj => {
    const { name, responseStream, requestStream } = fnObj;

    shimmer.wrap(clientModule.Client.prototype, name, function (origFn) {
      return function (method) {
        const hostAndPort = splitHostPort(address);

        if (hostAndPort.port && typeof hostAndPort.port === 'number') {
          hostAndPort.port = hostAndPort.port.toString();
        }

        const parentSpan = cls.getCurrentSpan();
        const isTracing = isActive && cls.isTracing() && parentSpan && !constants.isExitSpan(parentSpan);
        const isSuppressed = cls.tracingLevel() === '0';

        if (!isTracing && !isSuppressed) {
          return origFn.apply(this, arguments);
        }

        const originalArgs = copyArgs(arguments);

        // NOTE: isTracing is false when the span should be suppressed
        if (isSuppressed) {
          modifyArgs(name, originalArgs, null);
          return origFn.apply(this, originalArgs);
        }

        /**
         * https://github.com/grpc/grpc-node/blob/master/packages/grpc-js/src/client.ts#L281
         */
        return instrumentedClientMethod(
          this,
          origFn,
          originalArgs,
          hostAndPort,
          method,
          requestStream,
          responseStream,
          (args, span) => {
            return modifyArgs(name, args, span);
          }
        );
      };
    });
  });
}

// See https://github.com/grpc/grpc-node/blob/master/packages/grpc-js/src/client.ts
function modifyArgs(name, originalArgs, span) {
  const wrapCallback = (newArgs, originalCb) => {
    newArgs[newArgs.length - 1] = cls.ns.bind(function (err) {
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
      originalCb.apply(this, arguments);
    });
  };

  const setInstanaHeaders = metadata => {
    if (metadata && metadata.set) {
      // NOTE: if the span is null, the tracing is suppressed
      if (span) {
        metadata.set(constants.spanIdHeaderName, span.s);
        metadata.set(constants.traceIdHeaderName, span.t);
        metadata.set(constants.traceLevelHeaderName, '1');
      } else {
        metadata.set(constants.traceLevelHeaderName, '0');
      }
    }
  };

  const checkMetadataOptionsAndCallback = (method, serialize, deserialize, argument, metadata, options, callback) => {
    const arg1 = metadata;
    const arg2 = options;
    const arg3 = callback;

    let newMetadata;
    let newOptions;
    let newCallback;

    if (typeof arg1 === 'function') {
      newMetadata = new Metadata();
      newCallback = arg1;

      originalArgs[originalArgs.length - 1] = newMetadata;
      originalArgs.push(newCallback);
    } else if (typeof arg2 === 'function') {
      if (arg1 instanceof Metadata) {
        newMetadata = arg1;
        newCallback = arg2;

        originalArgs[originalArgs.length - 2] = newMetadata;
        originalArgs[originalArgs.length - 1] = newCallback;
      } else {
        newMetadata = new Metadata();
        newOptions = arg1;
        newCallback = arg2;

        originalArgs[originalArgs.length - 2] = newMetadata;
        originalArgs[originalArgs.length - 1] = newOptions;
        originalArgs.push(newCallback);
      }
    } else {
      // CASE: makeUnaryCall(...., metadata) -> no callback
      if (arg1 instanceof Metadata && !arg2 && !arg3) {
        setInstanaHeaders(arg1, span);
        return;
      }

      // NOTE: Do nothing, because the format we expect is different
      if (!(arg1 instanceof Metadata && arg2 instanceof Object && typeof arg3 === 'function')) {
        return;
      }

      newMetadata = arg1;
      newOptions = arg2;
      newCallback = arg3;
    }

    if (span) {
      wrapCallback(originalArgs, newCallback);
    }

    setInstanaHeaders(newMetadata, span);
  };

  const checkMetadataAndOptions = (method, serialize, deserialize, argument, metadata, options) => {
    const arg1 = metadata;
    const arg2 = options;
    let newMetadata;
    let newOptions;

    if (arg1 instanceof Metadata) {
      newMetadata = arg1;
    } else if (!arg1 && !arg2) {
      newOptions = {};
      newMetadata = new Metadata();

      originalArgs.push(newMetadata);
      originalArgs.push(newOptions);
    } else {
      newOptions = arg1;
      newMetadata = new Metadata();

      originalArgs[originalArgs.length - 1] = newMetadata;
      originalArgs.push(newOptions);
    }

    setInstanaHeaders(newMetadata, span);
  };

  if (name === 'makeClientStreamRequest') {
    return checkMetadataOptionsAndCallback(
      originalArgs[0],
      originalArgs[1],
      originalArgs[2],
      null,
      originalArgs[3],
      originalArgs[4],
      originalArgs[5]
    );
  }

  if (name === 'makeUnaryRequest') {
    return checkMetadataOptionsAndCallback(...originalArgs);
  }

  return checkMetadataAndOptions(...originalArgs);
}

function copyArgs(args) {
  const originalArgs = new Array(args.length);
  for (let i = 0; i < args.length; i++) {
    originalArgs[i] = args[i];
  }
  return originalArgs;
}

function shimServerRegister(originalFunction) {
  return function (name, handler, serialize, deserialize, type) {
    // NOTE: Ensure any new types won't run through our instrumention
    if (ALL_TYPES.indexOf(type) < 0) {
      logger.warn(`Failed to instrument GRPC-JS entry ${name}, type is unsupported: ${type}`);
      return originalFunction.apply(this, arguments);
    }

    const originalArgs = copyArgs(arguments);

    /**
     * Override the original handler e.g. `function unaryCall` (see server.js)
     * to instrument the incoming server call for the target type.
     *
     * name e.g. /instana.node.grpc.test.TestService/MakeUnaryCal
     * type e.g. unary
     */
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

    /*
     * The deprecated grpc module has used the server implementation in c++.
     * That's why we have not auto instrumented the incoming http 2 server call.
     * The `parentSpan` was always empty.
     *
     * But for grpc-js we autoinstrument the incoming http2 call.
     * The `parentSpan` for grpc-js is always the parent http2 server entry span.
     * We want to use the concept of priorisation and cancel the parent span.
     *
     * Any other parent span which is not node.http.server should result in an error,
     * because it signalises that something wrong happend. Usually this case
     * should not happen.
     */
    if (parentSpan) {
      if (parentSpan.n !== 'node.http.server') {
        logger.warn(
          'Cannot start a GRPC-JS entry span when another span is already active. Currently, the following span is ' +
            'active: ' +
            JSON.stringify(parentSpan)
        );
        return originalHandler.apply(originalThis, originalArgs);
      }

      parentSpan.cancel();
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

      if (TYPES_WITH_CALLBACK.indexOf(type) >= 0) {
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

      if (TYPES_WITH_CALL_END.indexOf(type) >= 0) {
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

function instrumentedClientMethod(
  ctx,
  originalFunction,
  originalArgs,
  address,
  rpcPath,
  requestStream,
  responseStream,
  modifyArgsFn
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

    modifyArgsFn(originalArgs, span);

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

function readMetadata(metadata, key) {
  // The grpc library normalizes keys internally to lower-case, so we do not need to take care of reading
  // them case-insensitive ourselves.
  const values = metadata.get(key);
  if (values && values.length > 0) {
    return values[0];
  }
  return null;
}

// Copied from https://github.com/grpc/grpc-node/blob/master/packages/grpc-js/src/uri-parser.ts
const NUMBER_REGEX = /^\d+$/;
function splitHostPort(path) {
  if (path.startsWith('[')) {
    const hostEnd = path.indexOf(']');

    if (hostEnd === -1) {
      return { host: null, port: null };
    }

    const host = path.substring(1, hostEnd);

    /* Only an IPv6 address should be in bracketed notation, and an IPv6
     * address should have at least one colon */
    if (host.indexOf(':') === -1) {
      return { host: null, port: null };
    }

    if (path.length > hostEnd + 1) {
      if (path[hostEnd + 1] === ':') {
        const portString = path.substring(hostEnd + 2);
        if (NUMBER_REGEX.test(portString)) {
          return {
            host: host,
            port: +portString
          };
        } else {
          return { host: null, port: null };
        }
      } else {
        return { host: null, port: null };
      }
    } else {
      return {
        host,
        port: null
      };
    }
  } else {
    const splitPath = path.split(':');
    /* Exactly one colon means that this is host:port. Zero colons means that
     * there is no port. And multiple colons means that this is a bare IPv6
     * address with no port */
    if (splitPath.length === 2) {
      if (NUMBER_REGEX.test(splitPath[1])) {
        return {
          host: splitPath[0],
          port: +splitPath[1]
        };
      } else {
        return { host: null, port: null };
      }
    } else {
      return {
        host: path,
        port: null
      };
    }
  }
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

// NOTE: Only exposed for tests. Not nice, but acceptable
exports.modifyArgs = modifyArgs;
exports.instrumentModule = instrumentModule;

exports.activate = function () {
  isActive = true;
};

exports.deactivate = function () {
  isActive = false;
};
