'use strict';

const path = require('path');

const AbstractControls = require('../../AbstractControls');

const Controls = (module.exports = function Controls(opts) {
  opts.appPath = path.join(__dirname, 'server.js');
  AbstractControls.call(this, opts);
});

Controls.prototype = Object.create(AbstractControls.prototype);
