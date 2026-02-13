/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const { uninstrumentedFs: fs } = require('@_local/core');

const activeRequests = require('../src/activeRequests');

describe('metrics.activeRequests', () => {
  it('should export active requests count', () => {
    // @ts-ignore
    expect(activeRequests.currentPayload).to.equal(process._getActiveRequests().length);
  });

  it('should update requests count for a fs.open', () => {
    const activeRequestBefore = activeRequests.currentPayload;
    for (let i = 0; i < 13; i++) {
      fs.open(__filename, 'r', () => {});
    }
    expect(activeRequests.currentPayload).to.equal(activeRequestBefore + 13);
  });
});
