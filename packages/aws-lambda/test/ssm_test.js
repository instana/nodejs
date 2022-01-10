/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const mock = require('mock-require');
const sinon = require('sinon');
const expect = require('chai').expect;
const ssm = require('../src/ssm');

let getParameterMock;
let awsUpdateConfigMock;

describe('Unit: ssm library', () => {
  before(() => {
    process.env.INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS = 500;
  });
  after(() => {
    delete process.env.INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS;
    delete process.env.INSTANA_LAMBDA_SSM_AWS_TIMEOUT_IN_MS;
  });
  afterEach(() => {
    delete process.env.INSTANA_SSM_PARAM_NAME;
    ssm.reset();
  });

  it('should return false if ssm env is not set', () => {
    expect(ssm.validate()).to.be.false;
  });
  it('should env value if ssm env is set', () => {
    process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
    expect(ssm.validate()).to.equal('hello instana agent key');
  });

  describe('init & waitAndGetInstanaKey', () => {
    beforeEach(() => {
      getParameterMock = sinon.stub();
      awsUpdateConfigMock = sinon.stub();

      mock('aws-sdk', {
        config: {
          update: awsUpdateConfigMock
        },
        // eslint-disable-next-line object-shorthand
        SSM: function () {
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

      const AWS = require('aws-sdk');
      expect(AWS.config.update.callCount).to.equal(0);
      expect(new AWS.SSM().getParameter.callCount).to.equal(0);
    });

    it('validate & init timeout difference is too high', callback => {
      const AWS = require('aws-sdk');

      process.env.INSTANA_SSM_PARAM_NAME = 'hello instana agent key';
      process.env.INSTANA_LAMBDA_SSM_AWS_TIMEOUT_IN_MS = 500;

      ssm.validate();

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(new AWS.SSM().getParameter.callCount).to.equal(1);
      expect(AWS.config.update.callCount).to.equal(1);

      setTimeout(() => {
        const interval = ssm.waitAndGetInstanaKey((err, value) => {
          expect(err).to.equal('Stopped waiting for AWS SSM response.');
          expect(value).to.be.undefined;
          callback();
        });

        expect(interval).to.be.undefined;
      }, 800);
    });

    it('should fetch aws ssm value if ssm env is set', callback => {
      const AWS = require('aws-sdk');

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
        }, 200);
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(new AWS.SSM().getParameter.callCount).to.equal(1);
      expect(AWS.config.update.callCount).to.equal(1);

      const interval = ssm.waitAndGetInstanaKey((err, value) => {
        expect(err).to.be.null;
        expect(value).to.equal('instana-value');
        expect(interval._destroyed).to.be.true;
        callback();
      });

      expect(interval).to.exist;
    });

    it('should fetch aws ssm value if ssm env is set, but timeout kicks in', callback => {
      const AWS = require('aws-sdk');

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
        }, 750);
      });

      expect(ssm.init({ logger: { debug: sinon.stub() } })).to.be.undefined;

      expect(new AWS.SSM().getParameter.callCount).to.equal(1);
      expect(AWS.config.update.callCount).to.equal(1);

      const interval = ssm.waitAndGetInstanaKey((err, value) => {
        expect(err).to.equal(
          'Could not fetch instana key from SSM parameter store using ' +
            '"hello instana agent key", because we have not received a response from AWS.'
        );
        expect(value).to.be.undefined;
        expect(interval._destroyed).to.be.true;
        callback();
      });

      expect(interval).to.exist;
    });
  });
});
