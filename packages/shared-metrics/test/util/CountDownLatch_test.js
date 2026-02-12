/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { expect } = require('chai');

const config = require('@_local/core/test/config');
const CountDownLatch = require('../../src/util/CountDownLatch');

describe('count down latch event emitter', function () {
  this.timeout(config.getTestTimeout());

  it('should not accept a negative counter', () => {
    expect(() => {
      // eslint-disable-next-line no-new
      new CountDownLatch(-1);
    }).to.throw();
  });

  it('should emit done', done => {
    const countDownLatch = new CountDownLatch(3);

    let expectDone = false;
    countDownLatch.once('done', () => {
      if (expectDone) {
        done();
      } else {
        done(new Error('Did not expect to be done yet.'));
      }
    });

    setTimeout(() => {
      countDownLatch.countDown();
      setTimeout(() => {
        countDownLatch.countDown();
        setTimeout(() => {
          expectDone = true;
          countDownLatch.countDown();
        }, 30);
      }, 30);
    }, 30);
  });

  it('should default counter to 1', done => {
    const countDownLatch = new CountDownLatch();

    countDownLatch.once('done', () => {
      done();
    });

    setTimeout(() => {
      countDownLatch.countDown();
    }, 30);
  });

  it('should not emit done twice when counted down too often', done => {
    const countDownLatch = new CountDownLatch(2);

    let timesDoneHasBeenCalled = 0;
    countDownLatch.on('done', () => {
      timesDoneHasBeenCalled++;
    });

    setTimeout(() => {
      countDownLatch.countDown();
      setTimeout(() => {
        countDownLatch.countDown();
        setTimeout(() => {
          countDownLatch.countDown();
          setTimeout(() => {
            countDownLatch.countDown();
            expect(timesDoneHasBeenCalled).to.equal(1);
            done();
          }, 20);
        }, 20);
      }, 20);
    }, 20);
  });

  it('should count up and down', done => {
    const countDownLatch = new CountDownLatch(0);

    let expectDone = false;
    countDownLatch.once('done', () => {
      if (expectDone) {
        done();
      } else {
        done(new Error('Did not expect to be done yet.'));
      }
    });

    setTimeout(() => {
      countDownLatch.countUp();
      setTimeout(() => {
        countDownLatch.countUp();
        setTimeout(() => {
          countDownLatch.countDown();
          setTimeout(() => {
            expectDone = true;
            countDownLatch.countDown();
          }, 30);
        }, 30);
      }, 30);
    }, 30);
  });

  it('should not emit done twice when counted up and down repeatedly', done => {
    const countDownLatch = new CountDownLatch(0);

    let timesDoneHasBeenCalled = 0;
    countDownLatch.on('done', () => {
      timesDoneHasBeenCalled++;
    });

    setTimeout(() => {
      countDownLatch.countUp();
      setTimeout(() => {
        countDownLatch.countDown();
        setTimeout(() => {
          countDownLatch.countUp();
          setTimeout(() => {
            countDownLatch.countDown();
            expect(timesDoneHasBeenCalled).to.equal(1);
            done();
          }, 20);
        }, 20);
      }, 20);
    }, 20);
  });
});
