'use strict';

module.exports = exports = function sendToParent(message) {
  if (process.send) {
    process.send(message);
  }
};
