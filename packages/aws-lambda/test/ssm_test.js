/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mock = require('mock-require');
const sinon = require('sinon');
const expect = require('chai').expect;
const ssm = require('../src/ssm');

let sendCommandMock;

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

  it('should return env value if ssm env is set', () => {
    process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
    expect(ssm.validate()).to.be.true;
    expect(ssm.getValue()).to.equal('hello instana agent key');
    expect(ssm.isUsed()).to.be.true;
  });

  describe('init & waitAndGetInstanaKey', () => {
    beforeEach(() => {
      sendCommandMock = sinon.stub();

      mock('@aws-sdk/client-ssm', {
        SSMClient: function (opts) {
          expect(opts).to.eql({ region: 'a-region' });
          return {
            send: sendCommandMock
          };
        },
        GetParameterCommand: function (params) {
          return params;
        }
      });
    });

    afterEach(() => {
      mock.stop('@aws-sdk/client-ssm');
    });

    it('should not fetch AWS SSM value if ssm env is not set', () => {
      ssm.validate();
      expect(ssm.init({ logger: sinon.stub() })).to.be.undefined;
      expect(ssm.isUsed()).to.be.false;
      expect(sendCommandMock.callCount).to.equal(0);
    });

    it('validate & init timeout difference is too high', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';

      ssm.validate();
      expect(ssm.init({ logger: { debug: sinon.stub(), warn: sinon.stub() } })).to.be.undefined;

      expect(sendCommandMock.callCount).to.equal(1);
      expect(sendCommandMock.getCall(0).args[0].Name).to.equal('hello instana agent key');
      expect(sendCommandMock.getCall(0).args[0].WithDecryption).to.be.false;

      setTimeout(() => {
        const interval = ssm.waitAndGetInstanaKey((err, value) => {
          expect(value).to.be.undefined;
          callback();
        });

        expect(interval).to.be.undefined;
      }, 1200);
    });

    it('should fetch AWS SSM value if ssm env is set', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
      ssm.validate();
      expect(ssm.isUsed()).to.be.true;

      sendCommandMock.callsFake(() => {
        return Promise.resolve({
          Parameter: {
            Value: 'instana-value'
          }
        });
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(sendCommandMock.callCount).to.equal(1);
      expect(sendCommandMock.getCall(0).args[0].Name).to.equal('hello instana agent key');
      expect(sendCommandMock.getCall(0).args[0].WithDecryption).to.be.false;

      const interval = ssm.waitAndGetInstanaKey((err, value) => {
        expect(err).to.be.null;
        expect(value).to.equal('instana-value');
        callback();
      });

      expect(interval).to.exist;
    });

    it('[with decryption] should fetch AWS SSM value if ssm env is set', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
      process.env.INSTANA_SSM_DECRYPTION = 'true';

      ssm.validate();
      expect(ssm.isUsed()).to.be.true;

      sendCommandMock.callsFake(() => {
        return Promise.resolve({
          Parameter: {
            Value: 'instana-value'
          }
        });
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(sendCommandMock.callCount).to.equal(1);
      expect(sendCommandMock.getCall(0).args[0].Name).to.equal('hello instana agent key');
      expect(sendCommandMock.getCall(0).args[0].WithDecryption).to.be.true;

      const interval = ssm.waitAndGetInstanaKey((err, value) => {
        expect(err).to.be.null;
        expect(value).to.equal('instana-value');
        callback();
      });

      expect(interval).to.exist;
    });

    it('should fetch AWS SSM value if ssm env is set, but timeout kicks in', callback => {
      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
      process.env.INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS = '500';

      ssm.validate();
      expect(ssm.isUsed()).to.be.true;

      sendCommandMock.callsFake(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              Parameter: {
                Value: 'instana-value'
              }
            });
          }, 750);
        });
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;
      expect(sendCommandMock.callCount).to.equal(1);

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
