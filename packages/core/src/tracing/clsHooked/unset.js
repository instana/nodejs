/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const currentSpanKey = 'com.instana.span';
const reducedSpanKey = 'com.instana.reduced';

/**
 * @param {import('./context').InstanaCLSContext} context
 * @param {string} key
 * @param {*} value
 */
module.exports = function unset(context, key, value) {
  if (context[key] === value) {
    storeReducedSpan(context, key, value);
    delete context[key];
  }
};

/**
 * Check if the provided object is an Instana span and if so, store a reduced version of the span under a special key.
 * The full span is reduced to a smaller set of attributes necessary to keep trace continuity. Potentially large fields
 * like data, stackTrace, etc. are not stored.
 * @param {import('./context').InstanaCLSContext} context
 * @param {string} key
 * @param {import('../cls').InstanaBaseSpan} span
 */
function storeReducedSpan(context, key, span) {
  // Keep only a reduced record for spans after transmission. This serves two purposes:
  // 1) If there is an async leak in the Node.js runtime, that is, missing destroy calls for async_hook resources for
  // which an init call has been received, the memory used by clsHooked will grow, because context objects will be  kept
  // around forever. By keeping the reduced span we can at least see (in a heap dump) for which type of spans the
  // destroy call is missing, aiding in troubleshooting the Node.js runtime bug.
  // 2) In some special cases, async continuity can break due to userland queueing. One example are GraphQL subscription
  // updates. The processing of the triggering HTTP entry has already finished by the time the subscription update is
  // processed. By keeping the reduced span around, we can still provide trace continuity. The reduced span will
  // automatically be removed when its async context is finally destroyed.
  if (key === currentSpanKey && span != null) {
    const gqd = span.gqd;
    context[reducedSpanKey] = {
      n: span.n,
      t: span.t,
      s: span.s,
      p: span.p,
      k: span.k
    };
    // Also keep captured GraphQL destination (host & port) for subscription updates, if present.
    if (gqd) {
      context[reducedSpanKey].gqd = gqd;
    }
  }
}
