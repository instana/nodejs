/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

// This is a rewrite of https://github.com/othiym23/emitter-listener/blob/master/test/basic.tap.js. See
// packages/core/srce/tracing/clsHooked/emitter-listener for the reason we are currently vendoring the emitter-listener
// dependency.

'use strict';

const { expect } = require('chai');
const Emitter = require('events').EventEmitter;
const ServerResponse = require('http').ServerResponse;
const IncomingMessage = require('http').IncomingMessage;

const wrapEmitter = require('../../../src/tracing/clsHooked/emitter-listener');

describe('emitter-listener', () => {
  it('with no parameters', () =>
    expect(function () {
      wrapEmitter();
    }).to.throw('can only wrap real EEs'));

  it('with only an emitter', () =>
    expect(function () {
      wrapEmitter(new Emitter());
    }).to.throw('must have function to run on listener addition'));

  it('with only an emitter and a marker', () =>
    expect(function () {
      wrapEmitter(new Emitter(), function () {});
    }).to.throw('must have function to wrap listeners when emitting'));

  it('with all required parameters', () => {
    function nop() {}
    function passthrough(value) {
      return value;
    }

    const ee = new Emitter();
    const numPropsBeforeWrap = Object.keys(ee).length;

    expect(function () {
      wrapEmitter(ee, nop, passthrough);
    }).to.not.throw();

    expect(ee.__wrapped, 'is marked as being a wrapped emitter').to.be.true;

    ee.on('test', function (value) {
      expect(value, 'value was still passed through').to.equal(8);
    });

    expect(function () {
      ee.emit('test', 8);
    }).to.not.throw('emitting still works');

    const numPropsAfterWrap = Object.keys(ee).length;
    expect(numPropsAfterWrap, "doesn't add extra enumerable properties").to.equal(numPropsBeforeWrap);
  });

  it('when a listener removes another listener', () => {
    const ee = new Emitter();
    function listener1() {
      /* nop */
    }
    function listener2() {
      ee.removeListener('listen', listener2);
    }

    function nop() {}
    function wrap(handler) {
      return function () {
        return handler.apply(this, arguments);
      };
    }
    wrapEmitter(ee, nop, wrap);

    ee.on('listen', listener1);
    ee.on('listen', listener2);
    expect(ee.listeners('listen').length, 'both listeners are there').to.equal(2);

    expect(function () {
      ee.emit('listen');
    }).to.not.throw('emitting still works');
    expect(ee.listeners('listen').length, 'one listener got removed').to.equal(1);
    expect(ee.listeners('listen')[0], 'the right listener is still there').to.equal(listener1);
  });

  it('when listener explodes', () => {
    const ee = new Emitter();
    wrapEmitter(
      ee,
      function marker() {},
      function prepare(handler) {
        return function wrapped() {
          handler.apply(this, arguments);
        };
      }
    );

    function kaboom() {
      throw new Error('whoops');
    }

    ee.on('bad', kaboom);

    expect(function () {
      ee.emit('bad');
    }).to.throw('whoops');
    expect(typeof ee.removeListener, 'removeListener is still there').to.equal('function');
    expect(ee.removeListener.__wrapped, 'removeListener got unwrapped').to.not.exist;
    expect(ee._events.bad).to.equal(kaboom, "listener isn't still bound");
  });

  it('when unwrapping emitter', () => {
    const ee = new Emitter();
    wrapEmitter(
      ee,
      function marker() {},
      function passthrough(handler) {
        return handler;
      }
    );

    expect(ee.addListener.__wrapped, 'addListener is wrapped').to.be.true;
    expect(ee.on.__wrapped, 'on is wrapped').to.be.true;
    expect(ee.emit.__wrapped, 'emit is wrapped').to.be.true;
    expect(ee.removeListener.__wrapped, 'removeListener is not wrapped').to.not.exist;

    expect(function () {
      ee.__unwrap();
    }).to.not.throw('can unwrap without dying');

    expect(ee.addListener.__wrapped, 'addListener is unwrapped').to.not.exist;
    expect(ee.on.__wrapped, 'on is unwrapped').to.not.exist;
    expect(ee.emit.__wrapped, 'emit is unwrapped').to.not.exist;
    expect(ee.removeListener.__wrapped, 'removeListener is unwrapped').to.not.exist;
  });

  it('when wrapping the same emitter multiple times', () => {
    const ee = new Emitter();
    const onAddListenerCalls = [];
    const onEmitCalls = [];
    wrapEmitter(
      ee,
      function onAddListener() {
        onAddListenerCalls.push(1);
      },
      function onEmit(handler) {
        onEmitCalls.push(1);
        return handler;
      }
    );

    wrapEmitter(
      ee,
      function onAddListener() {
        onAddListenerCalls.push(2);
      },
      function onEmit(handler) {
        onEmitCalls.push(2);
        return handler;
      }
    );

    ee.on('test', function (value) {
      expect(value).to.equal(31, 'got expected value');
      expect(onAddListenerCalls).to.deep.equal([1, 2], 'both onAddListener functions were called');
      expect(onEmitCalls).to.deep.equal([2, 1], 'both onEmit functions were called');
    });

    expect(ee.addListener.__wrapped, 'addListener is wrapped').to.be.true;
    expect(ee.on.__wrapped, 'on is wrapped').to.be.true;
    expect(ee.emit.__wrapped, 'emit is wrapped').to.be.true;
    expect(ee.removeListener.__wrapped, 'removeListener is not wrapped').to.not.exist;

    ee.emit('test', 31);
  });

  it('when adding multiple handlers to a ServerResponse', () => {
    const ee = new ServerResponse(new IncomingMessage());
    const values = [];

    ee.on('test', function () {});
    ee.on('test', function () {});

    wrapEmitter(
      ee,
      function marker() {
        values.push(1);
      },
      function passthrough(handler) {
        return handler;
      }
    );

    ee.on('test', function () {});

    expect(values, 'marker function was not called').to.deep.equal([1]);
  });
});
