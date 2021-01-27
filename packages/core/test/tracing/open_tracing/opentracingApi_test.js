/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const instanaOpentracing = require('../../../src/tracing/opentracing');
const apiCompatibilityChecks = require('opentracing/lib/test/api_compatibility').default;

describe('tracing/opentracing/opentracingApi', () => {
  apiCompatibilityChecks(instanaOpentracing.createTracer, {
    checkBaggageValues: true
  });
});
