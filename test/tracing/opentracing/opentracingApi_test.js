'use strict';

var instanaOpentracing = require('../../../src/tracing/opentracing');
var setupApiCompatibilityTest = require('opentracing/test/api_compatibility');

describe('tracing/opentracing/opentracingApi', function() {
  setupApiCompatibilityTest(instanaOpentracing.createTracer, {
    checkBaggageValues: true
  });
});
