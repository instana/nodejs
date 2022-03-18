/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const initializedTooLateHeurstic = require('../../src/util/initializedTooLateHeuristic');

describe('[UNIT] util.initializedTooLateHeurstic', () => {
  beforeEach(() => {
    initializedTooLateHeurstic.reset();
  });

  it('hasBeenInitializedTooLate is false', () => {
    expect(initializedTooLateHeurstic()).to.be.false;
  });

  it('hasBeenInitializedTooLate is false', () => {
    const p = '/Users/myuser/dev/instana/nodejs/node_modules/nope';
    require.cache[p] = {};
    expect(initializedTooLateHeurstic()).to.be.false;
    delete require.cache[p];
  });

  it('hasBeenInitializedTooLate is true', () => {
    const p = '/Users/myuser/dev/instana/nodejs/node_modules/mysql2/index.js';
    require.cache[p] = {};
    expect(initializedTooLateHeurstic()).to.be.true;
    delete require.cache[p];
  });

  it('hasBeenInitializedTooLate is true', () => {
    const p = '/Users/myuser/dev/instana/nodejs/node_modules/node-rdkafka/lib/producer.js';
    require.cache[p] = {};
    expect(initializedTooLateHeurstic()).to.be.true;
    delete require.cache[p];
  });
});
