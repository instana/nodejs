'use strict';

const expect = require('chai').expect;

const instanaUrlUtil = require('../../src/util/instana_url');

describe('instana_url util', () => {
  beforeEach(instanaUrlUtil._reset);

  it('must parse valid URLs', function() {
    instanaUrlUtil._validateUrl('https://example.com:8443');
    expect(instanaUrlUtil.isValid()).to.be.true;
    expect(instanaUrlUtil.getAcceptorHost()).to.equal('example.com');
    expect(instanaUrlUtil.getAcceptorPort()).to.equal('8443');
  });

  it('must reject non-TLS URLs', function() {
    instanaUrlUtil._validateUrl('http://example.com:8443');
    expect(instanaUrlUtil.isValid()).to.be.false;
    expect(instanaUrlUtil.getAcceptorHost()).to.not.exist;
    expect(instanaUrlUtil.getAcceptorPort()).to.not.exist;
  });

  it('must reject bogus protocols', function() {
    instanaUrlUtil._validateUrl('oink://example.com:8443');
    expect(instanaUrlUtil.isValid()).to.be.false;
    expect(instanaUrlUtil.getAcceptorHost()).to.not.exist;
    expect(instanaUrlUtil.getAcceptorPort()).to.not.exist;
  });

  it('must reject malformed URLs', function() {
    instanaUrlUtil._validateUrl('https://^^:asdf:forbidden>>characters:8443');
    expect(instanaUrlUtil.isValid()).to.be.false;
    expect(instanaUrlUtil.getAcceptorHost()).to.not.exist;
    expect(instanaUrlUtil.getAcceptorPort()).to.not.exist;
  });

  it('must use the default port if not specified', function() {
    instanaUrlUtil._validateUrl('https://example.com');
    expect(instanaUrlUtil.isValid()).to.be.true;
    expect(instanaUrlUtil.getAcceptorHost()).to.equal('example.com');
    expect(instanaUrlUtil.getAcceptorPort()).to.equal('443');
  });
});
