/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { resourceFromAttributes } = require('@opentelemetry/resources');

// Deprecated code rules can be seen here:
// https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto#L264

const codeUnsetWithDeprecatedCodeError = {
  attributes: {
    'http.url': 'http://localhost:9090/otel-test',
    'http.host': 'localhost:9090',
    'net.host.name': 'localhost',
    'http.method': 'GET',
    'http.route': '/otel-test',
    'http.target': '/otel-test',
    'http.user_agent': 'curl/7.64.1',
    'http.flavor': '1.1',
    'net.transport': 'ip_tcp',
    'net.host.ip': '::1',
    'net.host.port': 9090,
    'net.peer.ip': '::1',
    'net.peer.port': 52363,
    'http.status_code': 200,
    'http.status_text': 'OK'
  },
  links: [],
  events: [],
  status: { code: 0, deprecatedCode: 1 },
  endTime: [1631107938, 253342802],
  duration: [1, 84522577],
  name: 'GET /otel-test',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: 'f6b0a4ce066bb9a2',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: undefined,
  kind: 1,
  startTime: [1631107937, 168820225],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: { name: '@opentelemetry/instrumentation-http', version: '0.24.0' }
};

const codeUnsetWithDeprecatedCodeOk = {
  attributes: {
    'http.url': 'http://localhost:9090/otel-test',
    'http.host': 'localhost:9090',
    'net.host.name': 'localhost',
    'http.method': 'GET',
    'http.route': '/otel-test',
    'http.target': '/otel-test',
    'http.user_agent': 'curl/7.64.1',
    'http.flavor': '1.1',
    'net.transport': 'ip_tcp',
    'net.host.ip': '::1',
    'net.host.port': 9090,
    'net.peer.ip': '::1',
    'net.peer.port': 52363,
    'http.status_code': 200,
    'http.status_text': 'OK'
  },
  links: [],
  events: [],
  status: { code: 0, deprecated_code: 0 },
  endTime: [1631107938, 253342802],
  duration: [1, 84522577],
  name: 'GET /otel-test',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: 'f6b0a4ce066bb9a2',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: undefined,
  kind: 1,
  startTime: [1631107937, 168820225],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: { name: '@opentelemetry/instrumentation-http', version: '0.24.0' }
};

const codeUnsetWithoutDeprecatedCode = {
  attributes: {
    'http.url': 'http://localhost:9090/otel-test',
    'http.host': 'localhost:9090',
    'net.host.name': 'localhost',
    'http.method': 'GET',
    'http.route': '/otel-test',
    'http.target': '/otel-test',
    'http.user_agent': 'curl/7.64.1',
    'http.flavor': '1.1',
    'net.transport': 'ip_tcp',
    'net.host.ip': '::1',
    'net.host.port': 9090,
    'net.peer.ip': '::1',
    'net.peer.port': 52363,
    'http.status_code': 200,
    'http.status_text': 'OK'
  },
  links: [],
  events: [],
  status: { code: 0 },
  endTime: [1631107938, 253342802],
  duration: [1, 84522577],
  name: 'GET /otel-test',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: 'f6b0a4ce066bb9a2',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: undefined,
  kind: 1,
  startTime: [1631107937, 168820225],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: { name: '@opentelemetry/instrumentation-http', version: '0.24.0' }
};

const wrongTraceIdSizeSpan = {
  attributes: {
    'http.route': '/',
    'express.name': 'query',
    'express.type': 'middleware'
  },
  links: [],
  events: [],
  status: { code: 0 },
  endTime: [1631107937, 172263070],
  duration: [0, 562878],
  name: 'wrong-trace-id-span',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690',
      spanId: '125bb611747144b7',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: 'f6b0a4ce066bb9a2',
  kind: 0,
  startTime: [1631107937, 171700192],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: {
    name: '@opentelemetry/instrumentation-express',
    version: '0.24.0'
  }
};

const wrongSpanIdSizeSpan = {
  attributes: {
    'http.route': '/',
    'express.name': 'query',
    'express.type': 'middleware'
  },
  links: [],
  events: [],
  status: { code: 0 },
  endTime: [1631107937, 172263070],
  duration: [0, 562878],
  name: 'wrong-span-id-span',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: '5bb611747144b7',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: 'f6b0a4ce066bb9a2',
  kind: 0,
  startTime: [1631107937, 171700192],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: {
    name: '@opentelemetry/instrumentation-express',
    version: '0.24.0'
  }
};

const expressQuerySpan = {
  attributes: {
    'http.route': '/',
    'express.name': 'query',
    'express.type': 'middleware'
  },
  links: [],
  events: [],
  status: { code: 0 },
  endTime: [1631107937, 172263070],
  duration: [0, 562878],
  name: 'middleware - query',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: '5bb611747144b087',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: 'f6b0a4ce066bb9a2',
  kind: 0,
  startTime: [1631107937, 171700192],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: {
    name: '@opentelemetry/instrumentation-express',
    version: '0.24.0'
  }
};

const expressInitSpan = {
  attributes: {
    'http.route': '/',
    'express.name': 'expressInit',
    'express.type': 'middleware'
  },
  links: [],
  events: [],
  status: { code: 0 },
  endTime: [1631107937, 173045261],
  duration: [0, 218599],
  name: 'middleware - expressInit',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: '3402083dd113a328',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: 'f6b0a4ce066bb9a2',
  kind: 0,
  startTime: [1631107937, 172826662],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: {
    name: '@opentelemetry/instrumentation-express',
    version: '0.24.0'
  }
};

const expressHandlerSpan = {
  attributes: {
    'http.route': '/otel-test',
    'express.name': '/otel-test',
    'express.type': 'request_handler'
  },
  links: [],
  events: [],
  status: { code: 0 },
  endTime: [1631107937, 173364914],
  duration: [0, 40548],
  name: 'request handler - /otel-test',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: 'f4ab0223fc738bb3',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: 'f6b0a4ce066bb9a2',
  kind: 0,
  startTime: [1631107937, 173324366],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: {
    name: '@opentelemetry/instrumentation-express',
    version: '0.24.0'
  }
};

const expressGetSpan = {
  attributes: {
    'http.url': 'http://localhost:9090/otel-test',
    'http.host': 'localhost:9090',
    'net.host.name': 'localhost',
    'http.method': 'GET',
    'http.route': '/otel-test',
    'http.target': '/otel-test',
    'http.user_agent': 'curl/7.64.1',
    'http.flavor': '1.1',
    'net.transport': 'ip_tcp',
    'net.host.ip': '::1',
    'net.host.port': 9090,
    'net.peer.ip': '::1',
    'net.peer.port': 52363,
    'http.status_code': 200,
    'http.status_text': 'OK'
  },
  links: [],
  events: [],
  status: { code: 1 },
  endTime: [1631107938, 253342802],
  duration: [1, 84522577],
  name: 'GET /otel-test',
  spanContext() {
    return {
      traceId: 'f2d66a047ff7d91688e9960b690eb93c',
      spanId: 'f6b0a4ce066bb9a2',
      traceFlags: 1,
      traceState: undefined
    };
  },
  parentSpanId: undefined,
  kind: 1,
  startTime: [1631107937, 168820225],
  resource: resourceFromAttributes({}),
  instrumentationLibrary: { name: '@opentelemetry/instrumentation-http', version: '0.24.0' }
};

exports.spans = [
  expressQuerySpan,
  expressInitSpan,
  expressHandlerSpan,
  expressGetSpan,
  wrongSpanIdSizeSpan,
  wrongTraceIdSizeSpan,
  codeUnsetWithoutDeprecatedCode,
  codeUnsetWithDeprecatedCodeOk,
  codeUnsetWithDeprecatedCodeError
];
