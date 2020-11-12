'use strict';

const tracingMetrics = require('./metrics');

let logger;
logger = require('../logger').getLogger('tracing/spanBuffer', newLogger => {
  logger = newLogger;
});

const batchableSpanNames = [];
let downstreamConnection = null;
let isActive = false;
let activatedAt = null;

let batchThreshold = 10;
let batchingEnabled = false;
if (process.env.INSTANA_DEV_BATCH_THRESHOLD != null) {
  batchThreshold = parseInt(process.env.INSTANA_DEV_BATCH_THRESHOLD, 10);
  if (isNaN(batchThreshold)) {
    batchThreshold = 10;
  }
}
// Batched spans can grow past `batchThreshold` ms when merging them into batches, thus we make the lookup buckets wider
// than `batchThreshold` ms. At some point (every 90 ms) there is a hard cut for batching due to the lookup strategy.
// Thus, batched spans can at most become around 90 ms long.
const batchBucketWidth = batchThreshold * 3;

let minDelayBeforeSendingSpans = 1000;
if (process.env.INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS != null) {
  minDelayBeforeSendingSpans = parseInt(process.env.INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS, 10);
  if (isNaN(minDelayBeforeSendingSpans)) {
    minDelayBeforeSendingSpans = 1000;
  }
}

let initialDelayBeforeSendingSpans;
let transmissionDelay;
let maxBufferedSpans;
let forceTransmissionStartingAt;

let spans = [];
let batchingBuckets = new Map();

let transmissionTimeoutHandle;

exports.init = function init(config, _downstreamConnection) {
  downstreamConnection = _downstreamConnection;
  maxBufferedSpans = config.tracing.maxBufferedSpans;
  forceTransmissionStartingAt = config.tracing.forceTransmissionStartingAt;
  transmissionDelay = config.tracing.transmissionDelay;
  batchingEnabled = config.tracing.spanBatchingEnabled;
  initialDelayBeforeSendingSpans = Math.max(transmissionDelay, minDelayBeforeSendingSpans);
};

exports.activate = function activate() {
  if (!downstreamConnection) {
    logger.error('No downstreamConnection has been set.');
    return;
  }
  if (!downstreamConnection.sendSpans) {
    logger.error('Configured downstreamConnection has no attribute "sendSpans".');
    return;
  }
  if (typeof downstreamConnection.sendSpans !== 'function') {
    logger.error('downstreamConnection.sendSpans is not a function.');
    return;
  }
  isActive = true;
  if (activatedAt == null) {
    // record the time stamp of the first activation to enforce one second delay between sending snapshot data and
    // sending spans for the first time.
    activatedAt = Date.now();
  }
  spans = [];
  batchingBuckets.clear();
  transmissionTimeoutHandle = setTimeout(transmitSpans, initialDelayBeforeSendingSpans);
  transmissionTimeoutHandle.unref();
};

exports.deactivate = function deactivate() {
  isActive = false;
  spans = [];
  batchingBuckets.clear();
  clearTimeout(transmissionTimeoutHandle);
};

exports.enableSpanBatching = function enableSpanBatching() {
  batchingEnabled = true;
};

exports.addBatchableSpanName = function(spanName) {
  if (!batchableSpanNames.includes(spanName)) {
    batchableSpanNames.push(spanName);
  }
};

exports.addSpan = function(span) {
  if (!isActive) {
    return;
  }

  if (span.t == null) {
    logger.warn('Span of type %s has no trace ID. Not transmitting this span', span.n);
    return;
  }

  const spanIsBatchable = batchingEnabled && isBatchable(span);

  if (!spanIsBatchable || !addToBatch(span)) {
    // add span to span buffer, it will be sent downstream with the next transmission
    spans.push(span);

    if (spanIsBatchable) {
      // Put batcheable spans from the same trace into 30 ms wide buckets so we can find them for batching when more
      // spans are added later.
      const bucketKey = batchingBucketKey(span.ts);
      if (!batchingBuckets.has(span.t)) {
        batchingBuckets.set(span.t, new Map());
      }
      if (!batchingBuckets.get(span.t).has(bucketKey)) {
        batchingBuckets.get(span.t).set(bucketKey, []);
      }
      batchingBuckets
        .get(span.t)
        .get(bucketKey)
        .push(span);
    }

    if (spans.length >= forceTransmissionStartingAt && Date.now() - minDelayBeforeSendingSpans > activatedAt) {
      transmitSpans();
    }
  }
};

function addToBatch(span) {
  if (!batchingBuckets.has(span.t)) {
    // If we do not yet have any spans for this trace, we cannot batch anything either.
    return false;
  }

  // We store spans for batch lookup in buckets 30 ms wide. A potential partner span for batching can be in the bucket
  // this span would land in or in one of the two neighbouring buckets.
  const key = batchingBucketKey(span.ts);
  let hasBeenBatched = findBatchPartnerAndMerge(span, batchingBuckets.get(span.t).get(key));
  if (hasBeenBatched) {
    return true;
  }
  hasBeenBatched = findBatchPartnerAndMerge(span, batchingBuckets.get(span.t).get(key - batchBucketWidth));
  if (hasBeenBatched) {
    return true;
  }
  return findBatchPartnerAndMerge(span, batchingBuckets.get(span.t).get(key + batchBucketWidth));
}

function findBatchPartnerAndMerge(newSpan, bucket) {
  if (!bucket) {
    // We have not seen any spans yet for that bucket/timestamp range.
    return false;
  }

  for (let i = 0; i < bucket.length; i++) {
    const bufferedSpan = bucket[i];
    // Note: We do not need to check the span.d < 10 ms condition here because only short spans are added to the buckets
    // in the first place.
    if (
      // Only merge spans from the same trace,
      bufferedSpan.t === newSpan.t &&
      // with the same parent,
      bufferedSpan.p === newSpan.p &&
      // and the same type,
      bufferedSpan.n === newSpan.n &&
      // with a gap of less than 10 ms in between.
      (newSpan.ts >= bufferedSpan.ts
        ? newSpan.ts < bufferedSpan.ts + bufferedSpan.d + batchThreshold
        : bufferedSpan.ts < newSpan.ts + newSpan.d + batchThreshold)
    ) {
      mergeSpansAsBatch(bufferedSpan, newSpan, bucket, i);
      return true;
    }
  }
  return false;
}

function mergeSpansAsBatch(oldSpan, newSpan, bucket, indexInBucket) {
  // Determine, if the new span (about to be added to the buffer) is more significant than the old span that is already
  // in the buffer. Determine significance by:
  // 1. span.ec (higher wins)
  // 2. duration (higher wins)
  // 3. start time (earlier wins)
  let mustSwap;
  if (newSpan.ec > oldSpan.ec) {
    mustSwap = true;
  } else if (newSpan.ec === oldSpan.ec && newSpan.d > oldSpan.d) {
    mustSwap = true;
  } else if (newSpan.ec === oldSpan.ec && newSpan.d === oldSpan.d && newSpan.ts < oldSpan.ts) {
    mustSwap = true;
  }

  if (mustSwap) {
    // The new span is more significant, put the new span into the span buffer and merge the old span into it.
    const indexInSpanBuffer = spans.indexOf(oldSpan);
    if (indexInSpanBuffer >= 0) {
      spans[indexInSpanBuffer] = newSpan;
    }
    bucket[indexInBucket] = newSpan;
    mergeIntoTargetSpan(newSpan, oldSpan);
  } else {
    // The old span is at least as significant as the new span, keep it in the span buffer and merge the
    // new span into it.
    mergeIntoTargetSpan(oldSpan, newSpan);
  }
}

/*
 * Merges the source span into the target span. Assumes that target is already in the spanBuffer and source can be
 * discarded afterwards.
 */
function mergeIntoTargetSpan(target, source) {
  target.b = target.b || {};

  // Sum durations into span.b.d (batch duration). If one or both spans already are batched (and have a batch duration),
  // prefer that value over the span duration.
  if (target.b.d != null && source.b && source.b.d != null) {
    target.b.d += source.b.d;
  } else if (target.b.d != null) {
    target.b.d += source.d;
  } else if (source.b && source.b.d != null) {
    target.b.d = target.d + source.b.d;
  } else {
    target.b.d = target.d + source.d;
  }

  // Calculate latest end timestamp.
  const latestEnd = Math.max(target.ts + target.d, source.ts + source.d);

  // The batched span starts at the earliest timestamp.
  target.ts = Math.min(target.ts, source.ts);

  // Set duration of merged span to the distance between earliest start timestamp and latest end timestamp.
  target.d = latestEnd - target.ts;

  // Sum up error count.
  target.ec += source.ec;

  setBatchSize(target, source);
}

function setBatchSize(target, source) {
  if (target.b && target.b.s && source.b && source.b.s) {
    // Both spans already have a batch size, add them up. Note: It is rare that source already has batch properties,
    // but it can happen, for example because of batching of redis multi calls/batch calls directly in the redis
    // instrumentation.
    target.b.s += source.b.s;
    return;
  } else if (target.b && target.b.s) {
    // The old span has a batch size but the new one hasn't, simply increment by one.
    target.b.s += 1;
    return;
  }

  if (source.b && source.b.s) {
    // Only the new span has a batch size,
    target.b.s = source.b.s + 1;
  } else {
    target.b.s = 2;
  }
}

function batchingBucketKey(ts) {
  return ts - (ts % batchBucketWidth);
}

function isBatchable(span) {
  return (
    // Only batch spans shorter than 10 ms.
    span.d < batchThreshold &&
    // Only batch spans which have a parent (cannot batch a root span).
    span.p &&
    // Only batch spans which are batchable in principle because it is guaranteed to be a leave in the trace tree.
    batchableSpanNames.includes(span.n)
  );
}

function transmitSpans() {
  clearTimeout(transmissionTimeoutHandle);

  if (spans.length === 0) {
    transmissionTimeoutHandle = setTimeout(transmitSpans, transmissionDelay);
    transmissionTimeoutHandle.unref();
    return;
  }

  const spansToSend = spans;
  spans = [];
  batchingBuckets.clear();
  // We restore the content of the spans array if sending them downstream was not successful. We do not restore
  // batchingBuckets, though. This is deliberate. In the worst case, we might miss some batching opportunities, but
  // since sending spans downstream will take a few milliseconds, even that will be rare (and it is acceptable).

  downstreamConnection.sendSpans(spansToSend, function sendSpans(error) {
    if (error) {
      logger.warn(`Failed to transmit spans, will retry in ${transmissionDelay} ms.`, error.message);
      spans = spans.concat(spansToSend);
      removeSpansIfNecessary();
    }

    transmissionTimeoutHandle = setTimeout(transmitSpans, transmissionDelay);
    transmissionTimeoutHandle.unref();
  });
}

/**
 * Synchronously returns the spans that are scheduled for transmission and resets the internal span buffer to an empty
 * array.
 */
exports.getAndResetSpans = function getAndResetSpans() {
  const spansToSend = spans;
  spans = [];
  batchingBuckets.clear();
  return spansToSend;
};

function removeSpansIfNecessary() {
  if (spans.length > maxBufferedSpans) {
    const droppedCount = spans.length - maxBufferedSpans;
    logger.warn(`Span buffer is over capacity, dropping ${droppedCount} spans.`);
    tracingMetrics.incrementDropped(spans.length - maxBufferedSpans);
    // retain the last maxBufferedSpans elements, drop everything before that
    spans = spans.slice(-maxBufferedSpans);
  }
}
