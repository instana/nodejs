'use strict';

const metrics = {
  opened: 0,
  closed: 0,
  dropped: 0
};

exports.incrementOpened = function incrementOpened() {
  metrics.opened++;
};

exports.incrementClosed = function incrementClosed() {
  metrics.closed++;
};

exports.incrementDropped = function incrementDropped(dropped) {
  if (dropped == null) {
    metrics.dropped++;
  } else {
    metrics.dropped += dropped;
  }
};

exports.getAndReset = function getAndReset() {
  const m = Object.assign({}, metrics);
  metrics.opened = 0;
  metrics.closed = 0;
  metrics.dropped = 0;
  return m;
};
