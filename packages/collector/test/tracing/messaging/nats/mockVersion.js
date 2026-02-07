/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const mock = require('@_local/core/test/test_util/mockRequire');
const NATS_VERSION = process.env.NATS_VERSION === 'latest' ? 'nats' : `nats-${process.env.NATS_VERSION}`;

if (NATS_VERSION !== 'nats') {
  mock('nats', NATS_VERSION);
}
