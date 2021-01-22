/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

require('@instana/core').registerAdditionalInstrumentations([
  require('./instrumentation/process/edgemicro'),
  require('./instrumentation/process/childProcess')
]);
