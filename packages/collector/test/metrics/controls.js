/* eslint-env mocha */

'use strict';

const path = require('path');

const AbstractControls = require('../tracing/AbstractControls');

const Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'app.js');
  opts.port = 3216;
  opts.tracingEnabled = false;
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
