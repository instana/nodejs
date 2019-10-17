/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;

const environmentUtil = require('../../src/util/environment');

describe('environment util', () => {
  beforeEach(environmentUtil._reset);

  it('must parse valid URLs', () => {
    environmentUtil._validate('https://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('8443');
    expect(environmentUtil.getBackendPath()).to.equal('/');
  });

  it('must parse valid URLs with a path', () => {
    environmentUtil._validate('https://example.com:8443/serverless', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('8443');
    expect(environmentUtil.getBackendPath()).to.equal('/serverless');
  });

  it('must complain if Instana key is not set', () => {
    environmentUtil._validate('https://example.com:8443');
    expect(environmentUtil.isValid()).to.be.false;
  });

  it('must reject non-TLS URLs', () => {
    environmentUtil._validate('http://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getBackendHost()).to.not.exist;
    expect(environmentUtil.getBackendPort()).to.not.exist;
  });

  it('must reject bogus protocols', () => {
    environmentUtil._validate('oink://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getBackendHost()).to.not.exist;
    expect(environmentUtil.getBackendPort()).to.not.exist;
  });

  it('must reject malformed URLs', () => {
    environmentUtil._validate('https://^^:asdf:forbidden>>characters:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getBackendHost()).to.not.exist;
    expect(environmentUtil.getBackendPort()).to.not.exist;
  });

  it('must use the default port if not specified', () => {
    environmentUtil._validate('https://example.com', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('443');
    expect(environmentUtil.getBackendPath()).to.equal('/');
  });

  it('must use the default port if not specified but a path is included', () => {
    environmentUtil._validate('https://example.com/serverless', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('443');
    expect(environmentUtil.getBackendPath()).to.equal('/serverless');
  });
});
