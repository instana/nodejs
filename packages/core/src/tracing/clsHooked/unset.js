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
  // We keep a reduced record of spans after having sent them to the agent. This serves two purposes:
  //
  // 1) In some special cases, async continuity can break due to userland queueing or deferred exits.
  //
  // One example are GraphQL subscription updates. The processing of the HTTP entry that triggered the subscription
  // update has already finished by the time the subscription update is processed.
  //
  // Another example are deferred exit calls. For example, when processing an incoming HTTP request, the application
  // under monitoring could send a response back to the client early and trigger additional outgoing calls in an
  // asynchronous post-processing step (after sending back the response). Without keeping a reduced span, we would miss
  // these deferred exits - the exit instrumentation would see that there is no active entry span and would not record
  // the call as an exit span at all. To support deferred exit calls, instrumentations can fall back to the reduced span
  // if there is no active entry span. At the moment, only HTTP client instrumentations (httpClient, http2Client and
  // nativeFetch) and GraphQL subscription updates do this. We could potentially extend this to _all_ exit
  // instrumentations.
  //
  // In summary: By keeping the reduced span around, we can still provide trace continuity in these edge cases.
  //
  // Note: The reduced span will automatically be removed when its async context is finally destroyed. This is important
  // for two reasons, (a) keeping the reduced span does not create a memory leak and (b) we do not accidentally capture
  // exit spans under completely unrelated entry spans.
  //
  // 2) If there is an async leak in the Node.js runtime, that is, missing destroy calls for async_hook resources for
  // which an init call has been received, the memory used by clsHooked will grow, because context objects will be kept
  // around forever. By keeping the reduced span we can at least see (in a heap dump) for which type of spans the
  // destroy call is missing, aiding in troubleshooting the Node.js runtime bug.
  //
  // Exception:
  // SDK spans are different. Customers use "startEntrySpan" or "startExitSpan" manually inside their code base.
  // We cannot remember the reduced spans because it can mislead to a wrong functionality such as
  // tracing exit spans without entry spans - see sdkApp1.js.
  if (key === currentSpanKey && span != null && span.n !== 'sdk') {
    context[reducedSpanKey] = {
      n: span.n,
      t: span.t,
      s: span.s,
      p: span.p,
      k: span.k
    };

    // Also keep captured GraphQL destination (host & port) for subscription updates, if present.
    const gqd = span.gqd;
    if (gqd) {
      context[reducedSpanKey].gqd = gqd;
    }
  }
}
