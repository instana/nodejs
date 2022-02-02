/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mock = require('mock-require');
const sinon = require('sinon');
const expect = require('chai').expect;
const ssm = require('../src/ssm');

let getParameterMock;

describe('Unit: ssm library', () => {
  before(() => {
    process.env.AWS_REGION = 'a-region';
  });
  after(() => {
    delete process.env.AWS_REGION;
    delete process.env.INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS;
  });
  afterEach(() => {
    delete process.env.INSTANA_SSM_PARAM_NAME;
    ssm.reset();
  });

  it('should return false if ssm env is not set', () => {
    expect(ssm.validate()).to.be.false;
    expect(ssm.isUsed()).to.be.false;
  });
  it('should env value if ssm env is set', () => {
    process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
    expect(ssm.validate()).to.be.true;
    expect(ssm.getValue()).to.equal('hello instana agent key');
    expect(ssm.isUsed()).to.be.true;
  });

  describe('init & waitAndGetInstanaKey', () => {
    beforeEach(() => {
      getParameterMock = sinon.stub();

      mock('aws-sdk', {
        // eslint-disable-next-line object-shorthand
        SSM: function (opts) {
          expect(opts).to.eql({ region: 'a-region' });
          return { getParameter: getParameterMock };
        }
      });
    });

    afterEach(() => {
      mock.stop('aws-sdk');
    });

    it('should not fetch aws ssm value if ssm env is not set', () => {
      ssm.validate();
      expect(ssm.init({ logger: sinon.stub() })).to.be.undefined;
      expect(ssm.isUsed()).to.be.false;
      expect(getParameterMock.callCount).to.equal(0);
    });

    it('validate & init timeout difference is too high', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';

      ssm.validate();

      expect(ssm.init({ logger: { debug: sinon.stub(), warn: sinon.stub() } })).to.be.undefined;

      expect(getParameterMock.callCount).to.equal(1);

      expect(getParameterMock.getCall(0).args[0]).to.eql({
        Name: 'hello instana agent key',
        WithDecryption: false
      });

      setTimeout(() => {
        const interval = ssm.waitAndGetInstanaKey((err, value) => {
          expect(err).to.equal('Stopped waiting for AWS SSM response after 1000ms.');
          expect(value).to.be.undefined;
          callback();
        });

        expect(interval).to.be.undefined;
      }, 1200);
    });

    it('should fetch aws ssm value if ssm env is set', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
      ssm.validate();
      expect(ssm.isUsed()).to.be.true;

      getParameterMock.callsFake((params, cb) => {
        setTimeout(() => {
          cb(null, {
            Parameter: {
              Value: 'instana-value'
            }
          });
        }, 100);
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(getParameterMock.callCount).to.equal(1);
      expect(getParameterMock.getCall(0).args[0]).to.eql({
        Name: 'hello instana agent key',
        WithDecryption: false
      });

      const interval = ssm.waitAndGetInstanaKey((err, value) => {
        expect(err).to.be.null;
        expect(value).to.equal('instana-value');
        callback();
      });

      expect(interval).to.exist;
    });

    it('[with decryption] should fetch aws ssm value if ssm env is set', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
      process.env.INSTANA_SSM_DECRYPTION = 'true';

      ssm.validate();
      expect(ssm.isUsed()).to.be.true;

      getParameterMock.callsFake((params, cb) => {
        setTimeout(() => {
          cb(null, {
            Parameter: {
              Value: 'instana-value'
            }
          });
        }, 50);
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(getParameterMock.callCount).to.equal(1);
      expect(getParameterMock.getCall(0).args[0]).to.eql({
        Name: 'hello instana agent key',
        WithDecryption: true
      });

      const interval = ssm.waitAndGetInstanaKey((err, value) => {
        expect(err).to.be.null;
        expect(value).to.equal('instana-value');
        callback();
      });

      expect(interval).to.exist;
    });

    it('should fetch aws ssm value if ssm env is set, but timeout kicks in', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
      process.env.INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS = '500';

      ssm.validate();
      expect(ssm.isUsed()).to.be.true;

      getParameterMock.callsFake((params, cb) => {
        setTimeout(() => {
          cb(null, {
            Parameter: {
              Value: 'instana-value'
            }
          });
        }, 750);
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(getParameterMock.callCount).to.equal(1);

      const interval = ssm.waitAndGetInstanaKey((err, value) => {
        expect(err).to.equal(
          'Could not fetch instana key from SSM parameter store using ' +
            '"hello instana agent key", because we have not received a response from AWS.'
        );
        expect(value).to.be.undefined;
        callback();
      });

      expect(interval).to.exist;
    });
  });
});
