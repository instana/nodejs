/* eslint-env mocha */

'use strict';

const AbstractControls = require('./AbstractControls');

function ProcessControls(opts) {
  if (!opts.appPath) {
    throw new Error('Missing mandatory config option appPath.');
  }

  opts.port = opts.port || 3216;
  AbstractControls.call(this, opts);
}

ProcessControls.prototype = Object.create(AbstractControls.prototype);

module.exports = ProcessControls;
