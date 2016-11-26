'use strict';

// Switch the opentracing implementation in test mode so
// that we can execute the API compatibility tests.
if (process.env.USE_OPENTRACING_DEBUG_IMPL === 'true') {
  module.exports = require('opentracing/debug');
} else {
  module.exports = require('opentracing');
}
