/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const expectExactlyOneMatching = require('./expectExactlyOneMatching');
const constants = require('../../src/index').tracing.constants;
const { expect } = require('chai');

/**
 * @typedef {import('../../src/tracing/cls').InstanaBaseSpan} InstanaBaseSpan
 */

/**
 * @typedef {Object} HttpRootEntryOptions
 * @property {Array.<InstanaBaseSpan>} spans
 * @property {string} apiPath
 * @property {string} pid
 * @property {Array.<(span: InstanaBaseSpan) => void>} [extraTests]
 */

/**
 * @typedef {Object} ExitSpanOptions
 * @property {string} spanName
 * @property {Array.<InstanaBaseSpan>} spans
 * @property {InstanaBaseSpan} parent
 * @property {boolean} withError
 * @property {string} pid
 * @property {Array.<(span: InstanaBaseSpan) => void>} [extraTests]

 */

/**
 * @typedef {Object} HttpExitOptions
 * @property {Array.<InstanaBaseSpan>} spans
 * @property {InstanaBaseSpan} parent
 * @property {string} pid
 * @property {Array.<(span: InstanaBaseSpan) => void>} [extraTests]
 */

/**
 * @param {HttpRootEntryOptions} options
 * @returns {InstanaBaseSpan}
 */
// eslint-disable-next-line
exports.verifyHttpRootEntry = function verifyHttpRootEntry({ spans, apiPath, pid, extraTests }) {
  /** @type {Array.<(span: InstanaBaseSpan) => void>} */
  const tests = [
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.p).to.not.exist;
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.k).to.equal(constants.ENTRY);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.f.e).to.equal(pid);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.f.h).to.equal('agent-stub-uuid');
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.n).to.equal('node.http.server');
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.data.http.url).to.equal(apiPath);
    }
  ].concat(extraTests || []);

  return expectExactlyOneMatching(spans, tests);
};

/**
 * @param {ExitSpanOptions} options
 * @returns {InstanaBaseSpan}
 */
// eslint-disable-next-line
exports.verifyExitSpan = function verifyExitSpan({ spanName, spans, parent, withError, pid, extraTests }) {
  const tests = [
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.k).to.equal(constants.EXIT);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.n).to.equal(spanName);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.t).to.equal(parent.t);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.p).to.equal(parent.s);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.f.e).to.equal(pid);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.f.h).to.equal('agent-stub-uuid');
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.ec).to.equal(withError ? 1 : 0);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.data).to.exist;
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.data[spanName]).to.be.an('object');
    }
  ].concat(extraTests || []);

  return expectExactlyOneMatching(spans, tests);
};

/**
 * @param {HttpExitOptions} options
 * @returns {InstanaBaseSpan}
 */
// eslint-disable-next-line
exports.verifyHttpExit = function verifyHttpExit({ spans, parent, pid, extraTests }) {
  const tests = [
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.t).to.equal(parent.t);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.p).to.equal(parent.s);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.k).to.equal(constants.EXIT);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.f.e).to.equal(pid);
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.f.h).to.equal('agent-stub-uuid');
    },
    (/** @type {InstanaBaseSpan} */ span) => {
      expect(span.n).to.equal('node.http.client');
    }
  ].concat(extraTests || []);

  return expectExactlyOneMatching(spans, tests);
};
