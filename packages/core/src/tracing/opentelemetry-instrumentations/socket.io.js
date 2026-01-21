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
 * headers or meta data, only payload!
 */
exports.init = () => {
  const initStart = Date.now();

  const requireStart = Date.now();
  const { SocketIoInstrumentation } = require('@opentelemetry/instrumentation-socket.io');
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [SOCKET.IO] SocketIoInstrumentation require: ${Date.now() - requireStart}ms`);

  const createStart = Date.now();
  const instrumentation = new SocketIoInstrumentation();
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [SOCKET.IO] SocketIoInstrumentation creation: ${Date.now() - createStart}ms`);

  const enableStart = Date.now();
  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [SOCKET.IO] enable: ${Date.now() - enableStart}ms`);

  // eslint-disable-next-line no-console
  console.debug(`[PERF] [OTEL] [SOCKET.IO] TOTAL init: ${Date.now() - initStart}ms`);
};

exports.getKind = otelSpan => {
  let kind = constants.EXIT;

  if (isOnEvent(otelSpan)) {
    kind = constants.ENTRY;
  }

  return kind;
};

exports.changeTags = (otelSpan, tags) => {
  // NOTE: this adaption is needed to show the event name instead of a '/' for the endpoint name in the UI
  if (tags && 'messaging.socket.io.event_name' in tags) {
    if (isOnEvent(otelSpan)) {
      tags['messaging.destination'] = `ON ${tags['messaging.socket.io.event_name']}`;
    } else {
      tags['messaging.destination'] = `EMIT ${tags['messaging.socket.io.event_name']}`;
    }
  }

  return tags;
};
