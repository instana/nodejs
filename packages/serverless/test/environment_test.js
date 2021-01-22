/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const expect = require('chai').expect;

const environmentUtil = require('../src/environment');

describe('environment util', () => {
  const valuesBeforeTest = {};
  const keys = [
    //
    'INSTANA_ENDPOINT_URL',
    'INSTANA_AGENT_KEY',
    'INSTANA_URL',
    'INSTANA_KEY',
    'INSTANA_ZONE',
    'INSTANA_TAGS'
  ];

  before(() => {
    keys.forEach(key => {
      valuesBeforeTest[key] = process.env[key];
    });
  });

  beforeEach(() => {
    reset();
  });

  afterEach(() => {
    reset();
  });

  function reset() {
    environmentUtil._reset();
    keys.forEach(key => {
      if (valuesBeforeTest[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = valuesBeforeTest[key];
      }
    });
  }

  it('must parse valid URLs', () => {
    validate('https://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('8443');
    expect(environmentUtil.getBackendPath()).to.equal('/');
  });

  it('must parse valid URLs with a path', () => {
    validate('https://example.com:8443/serverless', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('8443');
    expect(environmentUtil.getBackendPath()).to.equal('/serverless');
  });

  it('must complain if Instana key is not set', () => {
    validate('https://example.com:8443');
    expect(environmentUtil.isValid()).to.be.false;
  });

  it('must reject non-TLS URLs', () => {
    validate('http://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getBackendHost()).to.not.exist;
    expect(environmentUtil.getBackendPort()).to.not.exist;
  });

  it('must reject bogus protocols', () => {
    validate('oink://example.com:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getBackendHost()).to.not.exist;
    expect(environmentUtil.getBackendPort()).to.not.exist;
  });

  it('must reject malformed URLs', () => {
    validate('https://^^:asdf:forbidden>>characters:8443', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.false;
    expect(environmentUtil.getBackendHost()).to.not.exist;
    expect(environmentUtil.getBackendPort()).to.not.exist;
  });

  it('must use the default port if not specified', () => {
    validate('https://example.com', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('443');
    expect(environmentUtil.getBackendPath()).to.equal('/');
  });

  it('must use the default port if not specified but a path is included', () => {
    validate('https://example.com/serverless', 'dummy-key');
    expect(environmentUtil.isValid()).to.be.true;
    expect(environmentUtil.getBackendHost()).to.equal('example.com');
    expect(environmentUtil.getBackendPort()).to.equal('443');
    expect(environmentUtil.getBackendPath()).to.equal('/serverless');
  });

  it('getCustomZone() must respond with undefined when INSTANA_ZONE is not set', () => {
    expect(environmentUtil.getCustomZone()).to.be.undefined;
  });

  it('getTags() must respond with undefined when INSTANA_TAGS is not set', () => {
    environmentUtil._parseTags();
    expect(environmentUtil.getTags()).to.be.undefined;
  });

  it('getTags() must respond with undefined when INSTANA_TAGS is only whitespace', () => {
    process.env.INSTANA_TAGS = '  \t \n\r \t ';
    environmentUtil._parseTags();
    expect(environmentUtil.getTags()).to.be.undefined;
  });

  it('getTags() must respond with a single tag when INSTANA_TAGS has no commas', () => {
    process.env.INSTANA_TAGS = ' this is my tag ';
    environmentUtil._parseTags();
    expect(environmentUtil.getTags()).to.deep.equal({
      'this is my tag': null
    });
  });

  it('must parse INSTANA_TAGS', () => {
    process.env.INSTANA_TAGS = ' tag_with_value = a value with spaces , tag_without_value ';
    environmentUtil._parseTags();
    expect(environmentUtil.getTags()).to.deep.equal({
      tag_with_value: ' a value with spaces ',
      tag_without_value: null
    });
  });

  function validate(instanaEndpointUrl, instanaAgentKey) {
    if (instanaEndpointUrl !== undefined) {
      process.env.INSTANA_ENDPOINT_URL = instanaEndpointUrl;
    }
    if (instanaAgentKey !== undefined) {
      process.env.INSTANA_AGENT_KEY = instanaAgentKey;
    }
    environmentUtil.validate();
  }
});
