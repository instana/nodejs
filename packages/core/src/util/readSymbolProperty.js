'use strict';

module.exports = exports = function readSymbolProperty(object, symbolString) {
  var symbol = Object.getOwnPropertySymbols(object).find(function(sym) {
    return sym && sym.toString() === symbolString;
  });
  if (symbol) {
    return object[symbol];
  }
  return undefined;
};
