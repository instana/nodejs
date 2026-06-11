/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// v1.23 uses start_time_unix_nano and end_time_unix_nano
// end_time_unix_nano is computed from start_time + duration

const LOOKUP_OVERRIDES = {
  metadata: {
    START_TIME_UNIX_NANO: 'start_time_unix_nano',
    END_TIME_UNIX_NANO: 'end_time_unix_nano'
  }
};

module.exports = { LOOKUP_OVERRIDES };
