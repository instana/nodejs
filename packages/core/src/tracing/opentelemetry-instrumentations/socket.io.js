/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const constants = require('../constants');

const isOnEvent = otelSpan => otelSpan.name.indexOf('receive') !== -1;
/**
 * socket.io-client is not instrumented.
 * We can easily instrument socket.io-client by instrumenting @socket.io/component-emitter
 * but the client is usually used in the browser, therefor we want to wait for requests.
 * Receiving messages does not create spans, only emitting.
 * https://github.com/socketio/socket.io-client/blob/4.6.1/lib/socket.ts#L9
 *
 * Trace correlation does not work with socket.io, because they do not support
 * headers or meta data, only payload.
 */
exports.init = () => {
  const { SocketIoInstrumentation } = require('@opentelemetry/instrumentation-socket.io');
  const instrumentation = new SocketIoInstrumentation();

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

exports.getKind = otelSpan => {
  let kind = constants.EXIT;

  if (isOnEvent(otelSpan)) {
    kind = constants.ENTRY;
  }

  return kind;
};

exports.transform = otelSpan => {
  // NOTE: this adaption is needed to show the event name instead of a '/' for the endpoint name in the UI
  if (otelSpan.attributes && 'messaging.socket.io.event_name' in otelSpan.attributes) {
    if (isOnEvent(otelSpan)) {
      otelSpan.attributes['messaging.destination'] = `ON ${otelSpan.attributes['messaging.socket.io.event_name']}`;
    } else {
      otelSpan.attributes['messaging.destination'] = `EMIT ${otelSpan.attributes['messaging.socket.io.event_name']}`;
    }
  }

  return otelSpan;
};
