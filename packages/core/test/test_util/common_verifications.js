/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const expectExactlyOneMatching = require('./expectExactlyOneMatching');
const constants = require('../../src/index').tracing.constants;
const { expect } = require('chai');

// eslint-disable-next-line
exports.verifyHttpRootEntry = function verifyHttpRootEntry({
  spans,
  apiPath,
  pid,
  extraTests,
  testMethod = expectExactlyOneMatching
}) {
  const tests = [
    span => {
      expect(span.p).to.not.exist;
    },
    span => {
      expect(span.k).to.equal(constants.ENTRY);
    },
    span => {
      expect(span.f.e).to.equal(pid);
    },
    span => {
      expect(span.f.h).to.equal('agent-stub-uuid');
    },
    span => {
      expect(span.n).to.equal('node.http.server');
    },
    span => {
      expect(span.data.http.url).to.equal(apiPath);
    }
  ].concat(extraTests || []);

  return testMethod(spans, tests);
};

// eslint-disable-next-line
exports.verifyExitSpan = function verifyExitSpan({
  spanName,
  spans,
  parent,
  withError,
  pid,
  extraTests,
  testMethod = expectExactlyOneMatching,
  dataProperty
}) {
  const tests = [
    span => {
      expect(span.k).to.equal(constants.EXIT);
    },
    span => {
      expect(span.n).to.equal(spanName);
    },
    span => {
      expect(span.t).to.equal(parent.t);
    },
    span => {
      expect(span.p).to.equal(parent.s);
    },
    span => {
      expect(span.f.e).to.equal(pid);
    },
    span => {
      expect(span.f.h).to.equal('agent-stub-uuid');
    },
    span => {
      expect(span.ec).to.equal(withError ? 1 : 0);
    },
    span => {
      expect(span.data).to.exist;
    },
    span => {
      expect(span.data[dataProperty || spanName]).to.be.an('object');
    }
  ].concat(extraTests || []);

  return testMethod(spans, tests);
};

// eslint-disable-next-line
exports.verifyHttpExit = function verifyHttpExit({
  spans,
  parent,
  pid,
  extraTests,
  testMethod = expectExactlyOneMatching
}) {
  const tests = [
    span => {
      parent ? expect(span.t).to.equal(parent.t) : '';
    },
    span => {
      parent ? expect(span.p).to.equal(parent.s) : '';
    },
    span => {
      expect(span.k).to.equal(constants.EXIT);
    },
    span => {
      expect(span.f.e).to.equal(pid);
    },
    span => {
      expect(span.f.h).to.equal('agent-stub-uuid');
    },
    span => {
      expect(span.n).to.equal('node.http.client');
    }
  ].concat(extraTests || []);

  return testMethod(spans, tests);
};
