'use strict';

const instanaOpentracing = require('../../../src/tracing/opentracing');
const apiCompatibilityChecks = require('opentracing/lib/test/api_compatibility').default;

describe('tracing/opentracing/opentracingApi', () => {
  apiCompatibilityChecks(instanaOpentracing.createTracer, {
    checkBaggageValues: true
  });
});
