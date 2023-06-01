/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

/**
 * A small collection of utilities for faking HTTP requests and responses. We use this to mock HTTP requests that are
 * executed via packages/core/src/uninstrumentedHttp.js.
 *
 * Why not simply use nock? Nock relies on being required before any other parts of the code require the core Node.js
 * http module, to monkey-patch it. This assumption is not true for our test suite. We actually require the http module
 * very early in the test suite via
 * packages/collector/test/hooks.js -> packages/collector/test/globalAgent.js
 * -> packages/collector/test/apps/agentStubControls.js -> packages/core/test/test_util/common_verifications.js
 * -> packages/core/src/index.js -> packages/core/src/uninstrumentedHttp.js.
 * Thus, the http module instance we use in uninstrumentedHttp cannot be patched via nock.
 */

module.exports = {
  FakeRequest: require('./FakeRequest'),
  FakeRequestHandler: require('./FakeRequestHandler'),
  FakeResponse: require('./FakeResponse')
};
