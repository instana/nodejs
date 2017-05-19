'use strict';

var instanaOpentracing = require('../../../src/tracing/opentracing');
var apiCompatibilityChecks = require('opentracing/lib/test/api_compatibility').apiCompatibilityChecks;

describe('tracing/opentracing/opentracingApi', function() {
  apiCompatibilityChecks(instanaOpentracing.createTracer, {
    checkBaggageValues: true
  });
});
