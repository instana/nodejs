'use strict';

const path = require('path');

const AbstractControls = require('../../../collector/test/tracing/AbstractControls');

const Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'clientApp.js');
  opts.port = 3216;
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
