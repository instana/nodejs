'use strict';

require('@instana/core').registerAdditionalInstrumentations([
  require('./instrumentation/process/edgemicro'),
  require('./instrumentation/process/childProcess')
]);
