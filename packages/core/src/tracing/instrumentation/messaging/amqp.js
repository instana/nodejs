'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

var logger;
logger = require('../../../logger').getLogger('tracing/amqp', function(newLogger) {
  logger = newLogger;
});

var isActive = false;

exports.init = function() {
  requireHook.onFileLoad(/\/amqplib\/lib\/channel\.js/, instrumentChannel);
  requireHook.onFileLoad(/\/amqplib\/lib\/channel_model\.js/, instrumentChannelModel);
  requireHook.onFileLoad(/\/amqplib\/lib\/callback_model\.js/, instrumentCallbackModel);
};

function instrumentChannel(channelModule) {
  shimmer.wrap(channelModule.Channel.prototype, 'sendMessage', shimSendMessage);
  shimmer.wrap(channelModule.BaseChannel.prototype, 'dispatchMessage', shimDispatchMessage);
}

function instrumentChannelModel(channelModelModule) {
  shimmer.wrap(channelModelModule.ConfirmChannel.prototype, 'publish', shimChannelModelPublish);
  shimmer.wrap(channelModelModule.Channel.prototype, 'get', shimChannelModelGet);
}

function instrumentCallbackModel(callbackModelModule) {
  shimmer.wrap(callbackModelModule.ConfirmChannel.prototype, 'publish', shimCallbackModelPublish);
  shimmer.wrap(callbackModelModule.Channel.prototype, 'get', shimCallbackModelGet);
}

function shimSendMessage(originalFunction) {
  return function() {
    if (isActive && cls.isTracing()) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedSendMessage(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedSendMessage(ctx, originalSendMessage, originalArgs) {
  var parentSpan = cls.getCurrentSpan();

  if (
    !cls.isTracing() || //
    !parentSpan || //
    // allow rabbitmq parent exit spans, this is actually the span started in instrumentedChannelModelPublish
    (constants.isExitSpan(parentSpan) && parentSpan.n !== 'rabbitmq')
  ) {
    return originalSendMessage.apply(ctx, originalArgs);
  }

  if (constants.isExitSpan(parentSpan) && parentSpan.n === 'rabbitmq') {
    // if ConfirmChannel#publish/sendToQueue has been invoked, we have already created a new cls context in
    // instrumentedChannelModelPublish and must not do so again here.
    processExitSpan(ctx, parentSpan, originalArgs);
    return originalSendMessage.apply(ctx, originalArgs);
    // the span is finished and transmitted in instrumentedChannelModelPublish
  } else {
    // Otherwise, a normal channel was used and we need to create the context here as usual.
    return cls.ns.runAndReturn(function() {
      var span = cls.startSpan('rabbitmq', constants.EXIT);
      processExitSpan(ctx, span, originalArgs);
      try {
        return originalSendMessage.apply(ctx, originalArgs);
      } finally {
        span.d = Date.now() - span.ts;
        span.transmit();
      }
    });
  }
}

function processExitSpan(ctx, span, originalArgs) {
  span.ts = Date.now();
  span.stack = tracingUtil.getStackTrace(instrumentedSendMessage);
  span.data = {
    rabbitmq: {
      sort: 'publish'
    }
  };
  if (ctx.connection.stream) {
    // prettier-ignore
    span.data.rabbitmq.address =
      (typeof ctx.connection.stream.getProtocol === 'function' ? 'amqps://' : 'amqp://') + //
      ctx.connection.stream.remoteAddress +
      ':' +
      ctx.connection.stream.remotePort;
  }
  var fieldsAndProperties = originalArgs[0] || {};
  if (fieldsAndProperties.exchange) {
    span.data.rabbitmq.exchange = fieldsAndProperties.exchange;
  }
  if (fieldsAndProperties.routingKey) {
    span.data.rabbitmq.key = fieldsAndProperties.routingKey;
  }

  // amqplib's sendMessage(fields, properties, ...) has two distinct parametes fields and properties but usually they
  // are the same object and used interchangeably. amqplib relies on the server to pick what it needs from either
  // fields or properties.
  setHeaders(originalArgs[0], span);
  setHeaders(originalArgs[1], span);
}

function setHeaders(map, span) {
  if (!map || !map.headers || tracingUtil.readAttribCaseInsensitive(map.headers, constants.traceLevelHeaderName)) {
    return;
  }
  map.headers[constants.traceIdHeaderName] = span.t;
  map.headers[constants.spanIdHeaderName] = span.s;
  map.headers[constants.traceLevelHeaderName] = '1';
}

function shimDispatchMessage(originalFunction) {
  return function() {
    if (isActive) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedDispatchMessage(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedDispatchMessage(ctx, originalDispatchMessage, originalArgs) {
  var fields = originalArgs[0] || {};
  var consumerTag = fields.consumerTag;
  var consumer = ctx.consumers[consumerTag];
  if (!consumer) {
    // amqplib will throw an error for this call because it can't be routed, so we don't create a span for it.
    return originalDispatchMessage.apply(ctx, originalArgs);
  }

  var parentSpan = cls.getCurrentSpan();
  if (parentSpan) {
    logger.warn(
      'Cannot start an AMQP entry span when another span is already active. Currently, the following span is ' +
        'active: ' +
        JSON.stringify(parentSpan)
    );
    return originalDispatchMessage.apply(ctx, originalArgs);
  }

  var headers =
    originalArgs[1] && originalArgs[1].properties && originalArgs[1].properties.headers
      ? originalArgs[1].properties.headers
      : {};

  return cls.ns.runAndReturn(function() {
    if (tracingUtil.readAttribCaseInsensitive(headers, constants.traceLevelHeaderName) === '0') {
      cls.setTracingLevel('0');
      return originalDispatchMessage.apply(ctx, originalArgs);
    }

    var span = cls.startSpan(
      'rabbitmq',
      constants.ENTRY,
      tracingUtil.readAttribCaseInsensitive(headers, constants.traceIdHeaderName),
      tracingUtil.readAttribCaseInsensitive(headers, constants.spanIdHeaderName)
    );
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedDispatchMessage);
    span.data = {
      rabbitmq: {
        sort: 'consume'
      }
    };

    if (ctx.connection.stream) {
      // prettier-ignore
      span.data.rabbitmq.address =
        (typeof ctx.connection.stream.getProtocol === 'function' ? 'amqps://' : 'amqp://') + //
        ctx.connection.stream.remoteAddress +
        ':' +
        ctx.connection.stream.remotePort;
    }
    if (fields.exchange) {
      span.data.rabbitmq.exchange = fields.exchange;
    }
    if (fields.routingKey) {
      span.data.rabbitmq.key = fields.routingKey;
    }

    try {
      return originalDispatchMessage.apply(ctx, originalArgs);
    } finally {
      setImmediate(function() {
        // Client code is expected to end the span manually, end it automatically in case client code doesn't. Child
        // exit spans won't be captured, but at least the RabbitMQ entry span is there.
        span.d = Date.now() - span.ts;
        span.transmit();
      });
    }
  });
}

function shimChannelModelGet(originalFunction) {
  return function() {
    if (isActive) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedChannelModelGet(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedChannelModelGet(ctx, originalGet, originalArgs) {
  // Each call to get has the potential to fetch a new message. We must create a new context and start a new span
  // *before* get is called, in case it indeed ends up fetching a new message. If the call ends up fetching no message,
  // we simply cancel the span instead of transmitting it.
  return cls.ns.runPromise(function() {
    var span = cls.startSpan('rabbitmq', constants.ENTRY);
    return originalGet.apply(ctx, originalArgs).then(function(result) {
      if (!result) {
        // get did not fetch a new message from RabbitMQ (because the queue has no messages), no need to create a span.
        span.cancel();
        return result;
      }
      var fields = result.fields || {};
      var headers = result.properties && result.properties.headers ? result.properties.headers : {};

      if (tracingUtil.readAttribCaseInsensitive(headers, constants.traceLevelHeaderName) === '0') {
        cls.setTracingLevel('0');
        span.cancel();
        return result;
      }

      var traceId = tracingUtil.readAttribCaseInsensitive(headers, constants.traceIdHeaderName);
      var parentSpanId = tracingUtil.readAttribCaseInsensitive(headers, constants.spanIdHeaderName);
      if (traceId && parentSpanId) {
        span.t = traceId;
        span.p = parentSpanId;
      }

      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(instrumentedChannelModelGet);
      span.data = {
        rabbitmq: {
          sort: 'consume'
        }
      };

      if (ctx.connection.stream) {
        span.data.rabbitmq.address =
          typeof ctx.connection.stream.getProtocol === 'function'
            ? 'amqps://'
            : 'amqp://' + //
              ctx.connection.stream.remoteAddress +
              ':' +
              ctx.connection.stream.remotePort;
      }
      if (fields.exchange) {
        span.data.rabbitmq.exchange = fields.exchange;
      }
      if (fields.routingKey) {
        span.data.rabbitmq.key = fields.routingKey;
      }

      setImmediate(function() {
        // Client code is expected to end the span manually, end it automatically in case client code doesn't. Child
        // exit spans won't be captured, but at least the RabbitMQ entry span is there.
        span.d = Date.now() - span.ts;
        span.transmit();
      });
      return result;
    });
  });
}

function shimCallbackModelGet(originalFunction) {
  return function() {
    if (isActive) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedCallbackModelGet(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedCallbackModelGet(ctx, originalGet, originalArgs) {
  var originalCallback = null;
  if (originalArgs.length >= 3 && typeof originalArgs[2] === 'function') {
    originalCallback = originalArgs[2];
  }

  originalArgs[2] = function(err, result) {
    if (err || !result) {
      // get did not fetch a new message from RabbitMQ (because the queue has no messages), no need to create a span.
      if (originalCallback) {
        return originalCallback(err, result);
      }
      return;
    }
    // get did fetch a message, create a new cls context and a span
    var parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        'Cannot start an AMQP entry span when another span is already active. Currently, the following span is ' +
          'active: ' +
          JSON.stringify(parentSpan)
      );
      return originalCallback(err, result);
    }

    return cls.ns.runAndReturn(function() {
      var fields = result.fields || {};
      var headers = result.properties && result.properties.headers ? result.properties.headers : {};

      if (tracingUtil.readAttribCaseInsensitive(headers, constants.traceLevelHeaderName) === '0') {
        cls.setTracingLevel('0');
        if (originalCallback) {
          return originalCallback(err, result);
        }
        return;
      }

      var span = cls.startSpan(
        'rabbitmq',
        constants.ENTRY,
        tracingUtil.readAttribCaseInsensitive(headers, constants.traceIdHeaderName),
        tracingUtil.readAttribCaseInsensitive(headers, constants.spanIdHeaderName)
      );
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(instrumentedChannelModelGet);
      span.data = {
        rabbitmq: {
          sort: 'consume'
        }
      };

      if (ctx.connection.stream) {
        span.data.rabbitmq.address =
          typeof ctx.connection.stream.getProtocol === 'function'
            ? 'amqps://'
            : 'amqp://' + //
              ctx.connection.stream.remoteAddress +
              ':' +
              ctx.connection.stream.remotePort;
      }
      if (fields.exchange) {
        span.data.rabbitmq.exchange = fields.exchange;
      }
      if (fields.routingKey) {
        span.data.rabbitmq.key = fields.routingKey;
      }

      setImmediate(function() {
        // Client code is expected to end the span manually, end it automatically in case client code doesn't. Child
        // exit spans won't be captured, but at least the RabbitMQ entry span is there.
        span.d = Date.now() - span.ts;
        span.transmit();
      });

      if (originalCallback) {
        return originalCallback(err, result);
      }
    });
  };

  return originalGet.apply(ctx, originalArgs);
}

function shimChannelModelPublish(originalFunction) {
  return function() {
    if (isActive) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedChannelModelPublish(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedChannelModelPublish(ctx, originalFunction, originalArgs) {
  // The main work is actually done in instrumentedSendMessage which will be called by ConfirmChannel.publish
  // internally. We only instrument ConfirmChannel.publish to hook into the callback.
  var parentSpan = cls.getCurrentSpan();

  if (!cls.isTracing() || constants.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('rabbitmq', constants.EXIT);
    // everything else is handled in instrumentedSendMessage/processExitSpan
    if (originalArgs.length >= 5 && typeof originalArgs[4] === 'function') {
      var originalCb = originalArgs[4];
      originalArgs[4] = cls.ns.bind(function() {
        span.d = Date.now() - span.ts;
        span.transmit();
        originalCb.apply(this, arguments);
      });
    }
    return originalFunction.apply(ctx, originalArgs);
  });
}

function shimCallbackModelPublish(originalFunction) {
  return function() {
    if (isActive) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedCallbackModelPublish(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedCallbackModelPublish(ctx, originalFunction, originalArgs) {
  // The main work is actually done in instrumentedSendMessage which will be called by ConfirmChannel.publish
  // internally. We only instrument ConfirmChannel.publish to hook into the callback.
  var parentSpan = cls.getCurrentSpan();

  if (!cls.isTracing() || constants.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('rabbitmq', constants.EXIT);
    // everything else is handled in instrumentedSendMessage/processExitSpan
    if (originalArgs.length >= 5 && typeof originalArgs[4] === 'function') {
      var originalCb = originalArgs[4];
      originalArgs[4] = cls.ns.bind(function() {
        span.d = Date.now() - span.ts;
        span.transmit();
        originalCb.apply(this, arguments);
      });
    }
    return originalFunction.apply(ctx, originalArgs);
  });
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
