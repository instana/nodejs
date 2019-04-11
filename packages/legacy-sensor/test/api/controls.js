/* eslint-env mocha */

'use strict';

var path = require('path');

var AbstractControls = require('../../../collector/test/tracing/AbstractControls');

var Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'app.js');
  opts.port = 3216;
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
