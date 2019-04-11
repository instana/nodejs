/* eslint-env mocha */

'use strict';

var path = require('path');

var AbstractControls = require('../../AbstractControls');

var Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'clientApp.js');
  opts.port = 3216;
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
