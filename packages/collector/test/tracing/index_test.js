/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var tracing = require('@instana/core').tracing;

describe('tracing', function() {
  describe('supportedVersion', function() {
    it('must support various Node.js versions', function() {
      expect(tracing.supportedVersion('4.5.0')).to.equal(true);
      expect(tracing.supportedVersion('4.5.1')).to.equal(true);
      expect(tracing.supportedVersion('4.6.0')).to.equal(true);
      expect(tracing.supportedVersion('4.14.0')).to.equal(true);
      expect(tracing.supportedVersion('5.10.0')).to.equal(true);
      expect(tracing.supportedVersion('5.11.0')).to.equal(true);
      expect(tracing.supportedVersion('6.0.0')).to.equal(true);
      expect(tracing.supportedVersion('6.1.0')).to.equal(true);
      expect(tracing.supportedVersion('6.2.0')).to.equal(true);
      expect(tracing.supportedVersion('7.3.3')).to.equal(true);
      expect(tracing.supportedVersion('8.2.1')).to.equal(true);
      expect(tracing.supportedVersion('8.3.0')).to.equal(true);
      expect(tracing.supportedVersion('8.9.1')).to.equal(true);
      expect(tracing.supportedVersion('9.1.0')).to.equal(true);
      expect(tracing.supportedVersion('9.2.0')).to.equal(true);
      expect(tracing.supportedVersion('10.4.0')).to.equal(true);
      expect(tracing.supportedVersion('10.13.0')).to.equal(true);
      expect(tracing.supportedVersion('11.0.0')).to.equal(true);
      expect(tracing.supportedVersion('11.1.0')).to.equal(true);
      expect(tracing.supportedVersion('11.2.0')).to.equal(true);
      expect(tracing.supportedVersion('11.3.0')).to.equal(true);
      expect(tracing.supportedVersion('11.4.0')).to.equal(true);
      expect(tracing.supportedVersion('11.5.0')).to.equal(true);
      expect(tracing.supportedVersion('11.6.0')).to.equal(true);
      expect(tracing.supportedVersion('12.0.0')).to.equal(true);
      expect(tracing.supportedVersion('12.1.0')).to.equal(true);
      expect(tracing.supportedVersion('13.0.0')).to.equal(true);
      expect(tracing.supportedVersion('14.0.0')).to.equal(true);
      expect(tracing.supportedVersion('15.0.0')).to.equal(true);
    });

    it('must report various Node.js versions as not supported', function() {
      expect(tracing.supportedVersion('1.15.0')).to.equal(false);
      expect(tracing.supportedVersion('2.15.0')).to.equal(false);
      expect(tracing.supportedVersion('3.15.0')).to.equal(false);
      expect(tracing.supportedVersion('4.4.9')).to.equal(false);
      expect(tracing.supportedVersion('4.0.0')).to.equal(false);
      expect(tracing.supportedVersion('5.9.0')).to.equal(false);
      expect(tracing.supportedVersion('8.0.0')).to.equal(false);
      expect(tracing.supportedVersion('8.1.4')).to.equal(false);
      expect(tracing.supportedVersion('9.0.0')).to.equal(false);
      expect(tracing.supportedVersion('10.0.0')).to.equal(false);
      expect(tracing.supportedVersion('10.1.0')).to.equal(false);
      expect(tracing.supportedVersion('10.2.0')).to.equal(false);
      expect(tracing.supportedVersion('10.3.0')).to.equal(false);
    });
  });
});
