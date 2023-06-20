/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const spanHandleModule = require('../../src/tracing/spanHandle');

const { expect } = chai;
chai.use(sinonChai);

describe('tracing/spanHandle', () => {
  const SpanHandle = spanHandleModule._SpanHandle;
  const NoopSpanHandle = spanHandleModule._NoopSpanHandle;

  it('NoOpSpanHandle should have the same methods as SpanHandle', () => {
    verifyMethods(SpanHandle, NoopSpanHandle);
  });

  it('SpanHandle should have the same methods as NoOpSpanHandle', () => {
    verifyMethods(NoopSpanHandle, SpanHandle);
  });

  function verifyMethods(source, target) {
    Object.keys(source.prototype).forEach(methodName => {
      if (!methodName.startsWith('_') && typeof source.prototype[methodName] === 'function') {
        expect(
          target.prototype[methodName],
          `The ${source.name} prototype has a method named ${methodName}, but this method is missing on ` +
            `${target.name}'s prototype.`
        ).to.be.a('function');
      }
    });
  }

  describe('annotate', () => {
    let span;
    let spanHandle;

    beforeEach(() => {
      span = { data: {} };
      spanHandle = new SpanHandle(span);
    });

    it('without path', () => {
      spanHandle.annotate(null, 'value');
      expect(span.data).to.deep.equal({});
    });

    it('with simple string path', () => {
      spanHandle.annotate('key', 'value');
      expect(span.data).to.deep.equal({ key: 'value' });
    });

    it('with nested string path', () => {
      spanHandle.annotate('key1.key2', 'value');
      expect(span.data).to.deep.equal({ key1: { key2: 'value' } });
    });

    it('with nested string path with leading and trailing dot', () => {
      spanHandle.annotate('.key1.key2.', 'value');
      expect(span.data).to.deep.equal({ key1: { key2: 'value' } });
    });

    it('with nested string path and existing nested object', () => {
      spanHandle.annotate('key1.key2', 'value2');
      // span.data.key1 already exists now, let's see if we can add another value there.
      spanHandle.annotate('key1.key3', 'value3');
      expect(span.data).to.deep.equal({
        key1: {
          key2: 'value2',
          key3: 'value3'
        }
      });
    });

    it('string path: should overwrite primitive attributes with an object if necessary', () => {
      spanHandle.annotate('key1', 'string');
      // span.data.key1 already exists now, but is a string.
      // The next call will overwrite key1 with an object.
      spanHandle.annotate('key1.key2', 'value');
      expect(span.data).to.deep.equal({
        key1: {
          key2: 'value'
        }
      });
    });

    it('with simple array path', () => {
      spanHandle.annotate(['key'], 'value');
      expect(span.data).to.deep.equal({ key: 'value' });
    });

    it('with nested array path', () => {
      spanHandle.annotate(['key1', 'key2'], 'value');
      expect(span.data).to.deep.equal({ key1: { key2: 'value' } });
    });

    it('with nested array path and existing nested object', () => {
      spanHandle.annotate(['key1', 'key2'], 'value2');
      // span.data.key1 already exists now, let's see if we can add another value there.
      spanHandle.annotate(['key1', 'key3'], 'value3');
      expect(span.data).to.deep.equal({
        key1: {
          key2: 'value2',
          key3: 'value3'
        }
      });
    });

    it('array path: should overwrite primitive attributes with an object if necessary', () => {
      spanHandle.annotate(['key1'], 'string');
      // span.data.key1 already exists now, but is a string.
      // The next call will overwrite key1 with an object.
      spanHandle.annotate(['key1', 'key2'], 'value');
      expect(span.data).to.deep.equal({
        key1: {
          key2: 'value'
        }
      });
    });

    it('annotate path template (string)', () => {
      span.freezePathTemplate = sinon.spy();
      spanHandle.annotate('http.path_tpl', '/product/{id}');
      expect(span.data).to.deep.equal({ http: { path_tpl: '/product/{id}' } });
      expect(span.freezePathTemplate).to.have.been.called;
    });

    it('annotate path template (array)', () => {
      span.freezePathTemplate = sinon.spy();
      spanHandle.annotate(['http', 'path_tpl'], '/product/{id}');
      expect(span.data).to.deep.equal({ http: { path_tpl: '/product/{id}' } });
      expect(span.freezePathTemplate).to.have.been.called;
    });
  });

  describe('markAsErroneous', () => {
    let span;
    let spanHandle;

    beforeEach(() => {
      span = {
        data: {},
        get ec() {
          return this._ec;
        }
      };
      spanHandle = new SpanHandle(span);
    });

    it('should set span.ec', () => {
      span.data.key = {};
      spanHandle.markAsErroneous('boom');
      expect(span.ec).to.equal(1);
      expect(span.data).to.deep.equal({ key: { error: 'boom' } });
    });

    it('should use default error message', () => {
      span.data.key = {};
      spanHandle.markAsErroneous();
      expect(span.ec).to.equal(1);
      expect(span.data).to.deep.equal({
        key: {
          error:
            'This call has been marked as erroneous via the Instana Node.js SDK, no error message has been supplied.'
        }
      });
    });

    it('should use custom path (string)', () => {
      spanHandle.markAsErroneous('boom', 'path.to.error');
      expect(span.ec).to.equal(1);
      expect(span.data).to.deep.equal({ path: { to: { error: 'boom' } } });
    });

    it('should use custom path (array)', () => {
      spanHandle.markAsErroneous('boom', ['path', 'to', 'error']);
      expect(span.ec).to.equal(1);
      expect(span.data).to.deep.equal({ path: { to: { error: 'boom' } } });
    });
  });

  describe('markAsNonErroneous', () => {
    let span;
    let spanHandle;

    beforeEach(() => {
      span = {
        _ec: 42,
        get ec() {
          return this._ec;
        },
        data: {}
      };
      spanHandle = new SpanHandle(span);
    });

    it('should set span.ec', () => {
      span.data.key = {};
      spanHandle.markAsNonErroneous();
      expect(span.ec).to.equal(0);
    });

    it('should reset the error message', () => {
      span.data.key = { error: 'boom', other: 'property' };
      spanHandle.markAsNonErroneous();
      expect(span.data).to.deep.equal({ key: { other: 'property' } });
    });

    it('should use custom path (string)', () => {
      span.data.path = { to: { error: 'boom', other: 'property' } };
      spanHandle.markAsNonErroneous('path.to.error');
      expect(span.data).to.deep.equal({ path: { to: { error: undefined, other: 'property' } } });
    });

    it('should use custom path (array)', () => {
      span.data.path = { to: { error: 'boom', other: 'property' } };
      spanHandle.markAsNonErroneous(['path', 'to', 'error']);
      expect(span.data).to.deep.equal({ path: { to: { error: undefined, other: 'property' } } });
    });
  });

  describe('_annotateErrorMessage', () => {
    let span;
    let spanHandle;

    beforeEach(() => {
      span = { n: 'span-name', data: {} };
      spanHandle = new SpanHandle(span);
    });

    it('should cope with a missing data object', () => {
      delete span.data;
      spanHandle._annotateErrorMessage('boom');
    });

    it('should cope with an empty data object', () => {
      spanHandle._annotateErrorMessage('boom');
      expect(span.data).to.deep.equal({});
    });

    it('should cope with multiple potential data sections', () => {
      span.data.key1 = {};
      span.data.key2 = {};
      spanHandle._annotateErrorMessage('boom');
      expect(span.data).to.deep.equal({ key1: {}, key2: {} });
    });

    it('should write the annotation if the path is unambigious', () => {
      span.data.key = { foo: 'bar' };
      spanHandle._annotateErrorMessage('boom');
      expect(span.data).to.deep.equal({ key: { foo: 'bar', error: 'boom' } });
    });

    it('should ignore irrelevant other keys in data', () => {
      // ignore string or other non-object attributes
      span.data.service = 'service name';

      // ignore peer section of db spans
      span.data.peer = {};

      // ignore attributes of type object that are actually arrays
      span.data.array = [];

      // ignore attributes without values
      span.data.nothing = null;

      // Should be ignored since there is also another eligible attribute.
      span.data.sdk = {};

      // The error message annotation should go here.
      span.data.key = {};

      spanHandle._annotateErrorMessage('boom');
      expect(span.data.key).to.deep.equal({ error: 'boom' });
    });

    it('should write to sdk if no other key is present', () => {
      span.data.sdk = {};
      spanHandle._annotateErrorMessage('boom');
      expect(span.data).to.deep.equal({ sdk: { error: 'boom' } });
    });
  });
});
