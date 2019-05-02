'use strict';

const expect = require('chai').expect;

const environmentUtil = require('../../src/util/environment');

describe('environment util', () => {
  beforeEach(environmentUtil._reset);

  it('must parse valid URLs', function() {
    environmentUtil._validate('https://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getAcceptorHost()).to.equal('example.com');
    expect(environmentUtil.getAcceptorPort()).to.equal('8443');
  });

  it('must complain if Instana key is not set', function() {
    environmentUtil._validate('https://example.com:8443');
    expect(environmentUtil.isValid()).to.be.false;
  });

  it('must reject non-TLS URLs', function() {
    environmentUtil._validate('http://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getAcceptorHost()).to.not.exist;
    expect(environmentUtil.getAcceptorPort()).to.not.exist;
  });

  it('must reject bogus protocols', function() {
    environmentUtil._validate('oink://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getAcceptorHost()).to.not.exist;
    expect(environmentUtil.getAcceptorPort()).to.not.exist;
  });

  it('must reject malformed URLs', function() {
    environmentUtil._validate('https://^^:asdf:forbidden>>characters:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getAcceptorHost()).to.not.exist;
    expect(environmentUtil.getAcceptorPort()).to.not.exist;
  });

  it('must use the default port if not specified', function() {
    environmentUtil._validate('https://example.com', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getAcceptorHost()).to.equal('example.com');
    expect(environmentUtil.getAcceptorPort()).to.equal('443');
  });
});
