/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const mock = require('mock-require');
const NATS_VERSION = process.env.NATS_VERSION === 'latest' ? 'nats' : `nats-${process.env.NATS_VERSION}`;

if (NATS_VERSION !== 'nats') {
  mock('nats', NATS_VERSION);
}
