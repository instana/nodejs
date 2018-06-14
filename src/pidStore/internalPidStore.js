'use strict';

// This file exists to avoid dependency cycles between:
//   logger => agent/bunyanToAgentStream => pidStore/index => logger
exports.pid = process.pid;
