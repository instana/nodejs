'use strict';

const instanaNodeJsCore = require('@instana/core');

exports.instrument = instanaNodeJsCore.tracing._instrument;
