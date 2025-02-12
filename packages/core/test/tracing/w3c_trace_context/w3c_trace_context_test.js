/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const constants = require('../../../src/tracing/constants');

const parse = require('../../../src/tracing/w3c_trace_context/parse').execute;

const version00 = '00';
const traceParentTraceId = '0af7651916cd43dd8448eb211c80319c';
const traceParentParentId = 'b7ad6b7169203331';
const flagsSampled = '01';
const flagsNotSampled = '00';
const validTraceParent = `${version00}-${traceParentTraceId}-${traceParentParentId}-${flagsSampled}`;
const validTraceParentNotSampled = `${version00}-${traceParentTraceId}-${traceParentParentId}-${flagsNotSampled}`;

const instana32CharTraceId = '0123456789abcdeffedcbc9876543210';
const instana16CharTraceId = '0123456789abcdef';
const instanaSpanId = '02468acefdb97531';
const instanaWideValue = `${instana32CharTraceId};${instanaSpanId}`;
const instanaNarrowValue = `${instana16CharTraceId};${instanaSpanId}`;

const otherInstana32CharTraceId = '3456789abcdeffedcbc9876543210012';
const otherInstana16CharTraceId = '3456789abcdeffed';
const otherInstanaSpanId = '13579bdfeca86420';
const otherInstanaWideValue = `${otherInstana32CharTraceId};${otherInstanaSpanId}`;
const otherInstanaNarrowValue = `${otherInstana16CharTraceId};${otherInstanaSpanId}`;

describe('W3cTraceContext API', () => {
  describe('clone', () => {
    it('should clone', () => {
      const traceStateValue = `rojo=00f067aa0ba902b7,${constants.w3cInstana}=${instanaWideValue},congo=t61rcWkgMzE`;
      const original = parse(validTraceParent, traceStateValue);
      const cloned = original.clone();

      expect(cloned).to.be.an('object');
      expect(original === cloned).to.not.be.true;
      expect(cloned.constructor.name).to.equal('W3cTraceContext');

      expect(cloned.traceParentValid).to.be.true;
      expect(cloned.version).to.equal(version00);
      expect(cloned.traceParentTraceId).to.equal(traceParentTraceId);
      expect(cloned.traceParentParentId).to.equal(traceParentParentId);
      expect(cloned.sampled).to.be.true;

      expect(cloned.traceStateValid).to.be.true;
      expect(cloned.traceStateHead).to.deep.equal(['rojo=00f067aa0ba902b7']);
      expect(cloned.instanaTraceId).to.equal(instana32CharTraceId);
      expect(cloned.instanaParentId).to.equal(instanaSpanId);
      expect(cloned.traceStateTail).to.deep.equal(['congo=t61rcWkgMzE']);
      expect(cloned.hasTraceState()).to.be.true;
    });
  });

  describe('update traceparent and tracestate (start a child span)', () => {
    [false, true].forEach(oldTraceIdIsShort =>
      [false, true].forEach(newTraceIdIsShort =>
        ['none', 'start', 'middle', 'end'].forEach(existingInstanaKeyPair =>
          [true, false].forEach(previouslySampled =>
            registerTests.bind(null, oldTraceIdIsShort, newTraceIdIsShort, existingInstanaKeyPair, previouslySampled)()
          )
        )
      )
    );

    function registerTests(oldTraceIdIsShort, newTraceIdIsShort, existingInstanaKeyPair, previouslySampled) {
      const oldInstanaValue = oldTraceIdIsShort ? instanaNarrowValue : instanaWideValue;
      const newInstanaValue = newTraceIdIsShort ? otherInstanaNarrowValue : otherInstanaWideValue;
      const newTraceId = newTraceIdIsShort ? otherInstana16CharTraceId : otherInstana32CharTraceId;

      const expectedTraceParentValue = `${version00}-${traceParentTraceId}-${otherInstanaSpanId}-${flagsSampled}`;
      // prettier-ignore
      const expectedTraceStateValue =
        `${constants.w3cInstana}=${newInstanaValue},rojo=00f067aa0ba902b7,congo=t61rcWkgMzE`;

      let oldTraceStateValue;
      let oldPositionTitle;
      if (existingInstanaKeyPair === 'none') {
        oldTraceStateValue = 'rojo=00f067aa0ba902b7,congo=t61rcWkgMzE';
        oldPositionTitle = 'no previous in key-value pair';
      } else if (existingInstanaKeyPair === 'start') {
        oldTraceStateValue = `${constants.w3cInstana}=${oldInstanaValue},rojo=00f067aa0ba902b7,congo=t61rcWkgMzE`;
        oldPositionTitle = 'an in key-value pair at the start';
      } else if (existingInstanaKeyPair === 'middle') {
        oldTraceStateValue = `rojo=00f067aa0ba902b7,${constants.w3cInstana}=${oldInstanaValue},congo=t61rcWkgMzE`;
        oldPositionTitle = 'an in key-value pair in the middle';
      } else if (existingInstanaKeyPair === 'end') {
        oldTraceStateValue = `rojo=00f067aa0ba902b7,congo=t61rcWkgMzE,${constants.w3cInstana}=${oldInstanaValue}`;
        oldPositionTitle = 'an in key-value pair at the end';
      } else {
        throw new Error(`Unknown position: ${existingInstanaKeyPair}`);
      }

      const wideNarrow = `${idLengthTitle(oldTraceIdIsShort)} => ${idLengthTitle(newTraceIdIsShort)}`;

      it(`should update internals with ${oldPositionTitle} (${wideNarrow}, sampled: ${previouslySampled})`, () => {
        const traceContext = parse(
          previouslySampled ? validTraceParent : validTraceParentNotSampled,
          oldTraceStateValue
        );

        traceContext.updateParent(newTraceId, otherInstanaSpanId);

        expect(traceContext.traceParentValid).to.be.true;
        expect(traceContext.version).to.equal(version00);
        expect(traceContext.traceParentTraceId).to.equal(traceParentTraceId);
        expect(traceContext.traceParentParentId).to.equal(otherInstanaSpanId);
        expect(traceContext.sampled).to.be.true;

        expect(traceContext.traceStateValid).to.be.true;
        expect(traceContext.traceStateHead).to.not.exist;
        expect(traceContext.instanaTraceId).to.equal(newTraceId);
        expect(traceContext.instanaParentId).to.equal(otherInstanaSpanId);
        expect(traceContext.traceStateTail).to.deep.equal(['rojo=00f067aa0ba902b7', 'congo=t61rcWkgMzE']);
        expect(traceContext.hasTraceState()).to.be.true;

        expect(traceContext.sampled).to.be.true;
      });

      it(`should update and render with ${oldPositionTitle} (${wideNarrow}, sampled: ${previouslySampled})`, () => {
        const traceContext = parse(
          previouslySampled ? validTraceParent : validTraceParentNotSampled,
          oldTraceStateValue
        );

        traceContext.updateParent(newTraceId, otherInstanaSpanId);

        const renderedTraceParent = traceContext.renderTraceParent();
        expect(renderedTraceParent).to.equal(expectedTraceParentValue);
        const renderedTraceState = traceContext.renderTraceState();
        expect(renderedTraceState).to.equal(expectedTraceStateValue);
      });
    }
  });

  describe('restart', () => {
    [false, true].forEach(registerTests);

    function registerTests(longTraceId) {
      it(`should restart (${idLengthTitle(!longTraceId)})`, () => {
        const traceContext = parse('something invalid', 'something invalid');

        traceContext.restartTrace(longTraceId);

        expect(traceContext.traceParentValid).to.be.true;
        expect(traceContext.version).to.equal(version00);
        expect(traceContext.traceParentTraceId).to.have.lengthOf(32);
        if (longTraceId) {
          expect(traceContext.traceParentTraceId).to.equal(traceContext.instanaTraceId);
        } else {
          expect(traceContext.traceParentTraceId).to.equal(`0000000000000000${traceContext.instanaTraceId}`);
        }
        expect(traceContext.traceParentParentId).to.have.lengthOf(16);
        expect(traceContext.traceParentParentId).to.equal(traceContext.instanaParentId);
        expect(traceContext.sampled).to.be.true;

        expect(traceContext.traceStateValid).to.be.true;
        expect(traceContext.traceStateHead).to.not.exist;
        expect(traceContext.traceStateTail).to.not.exist;
        expect(traceContext.hasTraceState()).to.be.true;
      });
    }
  });

  describe('reset tracestate', () => {
    [false, true].forEach(registerTests);

    function registerTests(longTraceId) {
      it(`should reset tracestate (${idLengthTitle(!longTraceId)})`, () => {
        const traceStateValue = 'rojo=00f067aa0ba902b7,congo=t61rcWkgMzE';
        const traceContext = parse(validTraceParent, traceStateValue);

        traceContext.resetTraceState();

        expect(traceContext.traceParentValid).to.be.true;
        expect(traceContext.version).to.equal(version00);
        expect(traceContext.traceParentTraceId).to.equal(traceParentTraceId);
        expect(traceContext.traceParentParentId).to.equal(traceParentParentId);
        expect(traceContext.sampled).to.be.true;

        expect(traceContext.traceStateValid).to.be.true;
        expect(traceContext.traceStateHead).to.not.exist;
        expect(traceContext.instanaTraceId).to.not.exist;
        expect(traceContext.instanaParentId).to.not.exist;
        expect(traceContext.traceStateTail).to.not.exist;
        expect(traceContext.hasTraceState()).to.be.false;
        expect(traceContext.renderTraceState()).to.equal('');
      });
    }
  });

  describe('disable sampling', () => {
    it('should toggle sampling flag to 0 (previously sampled: yes)', () => {
      const traceContext = parse(validTraceParent);

      traceContext.disableSampling();

      expect(traceContext.traceParentValid).to.be.true;
      expect(traceContext.version).to.equal(version00);
      expect(traceContext.traceParentTraceId).to.equal(traceParentTraceId);
      expect(traceContext.traceParentParentId).to.not.equal(traceParentParentId);
      expect(traceContext.sampled).to.be.false;
    });

    it('should toggle sampling flag to 0 (previously sampled: no)', () => {
      const traceContext = parse(validTraceParentNotSampled);

      traceContext.disableSampling();

      expect(traceContext.traceParentValid).to.be.true;
      expect(traceContext.version).to.equal(version00);
      expect(traceContext.traceParentTraceId).to.equal(traceParentTraceId);
      expect(traceContext.traceParentParentId).to.equal(traceParentParentId);
      expect(traceContext.sampled).to.be.false;
    });
  });
});

function idLengthTitle(shortId) {
  return shortId ? 'narrow' : 'wide';
}
