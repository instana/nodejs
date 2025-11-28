/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');
const semver = require('semver');
const instana = require('../src/index');

describe('Lambda handler compatibility', () => {
  const isLatestRuntime = semver.gte(process.version, '24.0.0');

  const event = { ok: true };
  const context = {
    functionName: 'fn',
    functionVersion: '1',
    awsRequestId: 'req-id',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:fn'
  };

  it('handles callback-style functions according to runtime version', done => {
    // eslint-disable-next-line no-shadow
    const handler = function (event, ctx, cb) {
      if (!cb) throw new Error('no callback provided');
      cb(null, 'cb-ok');
    };

    const wrapped = instana.wrap(handler);

    if (!isLatestRuntime) {
      wrapped(event, context, (err, result) => {
        expect(err).to.equal(null);
        expect(result).to.equal('cb-ok');
        done();
      });
    } else {
      let thrown;
      try {
        wrapped(event, context);
      } catch (e) {
        thrown = e;
      }
      // Note: In Node.js 24+, the runtime only passes 2 parameters (event, context) and doesn't provide a callback.
      expect(thrown).to.be.instanceOf(Error);
      expect(thrown.message).to.equal('no callback provided');
      done();
    }
  });

  it('executes async functions consistently across runtime versions', async () => {
    const handler = async () => 'async-ok';
    const wrapped = instana.wrap(handler);
    const result = await wrapped(event, context);
    expect(result).to.equal('async-ok');
  });

  it('executes promise-returning functions consistently across runtime versions', async () => {
    const handler = () => Promise.resolve('promise-ok');
    const wrapped = instana.wrap(handler);
    const result = await wrapped(event, context);
    expect(result).to.equal('promise-ok');
  });
});
