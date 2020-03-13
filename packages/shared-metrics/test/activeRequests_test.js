'use strict';

const expect = require('chai').expect;
const fs = require('fs');

const activeRequests = require('../src/activeRequests');

describe('metrics.activeRequests', () => {
  it('should export active requests count', () => {
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
