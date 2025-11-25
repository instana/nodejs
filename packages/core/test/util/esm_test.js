/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const expect = require('chai').expect;
const { hasExperimentalLoaderFlag, hasEsmLoaderFile } = require('../../src/util/esm');

describe('util.esm', () => {
  afterEach(() => {
    delete process.env.NODE_OPTIONS;
  });

  describe('hasExperimentalLoaderFlag', () => {
    it('should return true when --experimental-loader is in NODE_OPTIONS', () => {
      process.env.NODE_OPTIONS = '--experimental-loader ./loader.mjs';
      expect(hasExperimentalLoaderFlag()).to.be.true;
    });

    it('should return false when --experimental-loader is not present', () => {
      delete process.env.NODE_OPTIONS;
      expect(hasExperimentalLoaderFlag()).to.be.false;
    });

    it('should return false when NODE_OPTIONS has other flags', () => {
      process.env.NODE_OPTIONS = '--max-old-space-size=4096';
      expect(hasExperimentalLoaderFlag()).to.be.false;
    });
  });

  describe('hasEsmLoaderFile', () => {
    it('should return true when esm-loader.mjs is in NODE_OPTIONS', () => {
      process.env.NODE_OPTIONS = '--experimental-loader ./esm-loader.mjs';
      expect(hasEsmLoaderFile()).to.be.true;
    });

    it('should return true when esm-loader.mjs is in NODE_OPTIONS with other flags', () => {
      process.env.NODE_OPTIONS = '--max-old-space-size=4096 --experimental-loader./esm-loader.mjs';
      expect(hasEsmLoaderFile()).to.be.true;
    });

    it('should return false when NODE_OPTIONS is not set', () => {
      expect(hasEsmLoaderFile()).to.be.false;
    });

    it('should return false when NODE_OPTIONS has other loader files', () => {
      process.env.NODE_OPTIONS = '--import ./esm-register.mjs';
      expect(hasEsmLoaderFile()).to.be.false;
    });

    it('should return false when NODE_OPTIONS is empty', () => {
      process.env.NODE_OPTIONS = '';
      expect(hasEsmLoaderFile()).to.be.false;
    });
  });
});
