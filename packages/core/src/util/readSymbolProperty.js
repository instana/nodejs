'use strict';

module.exports = exports = function readSymbolProperty(object, symbolString) {
  const symbol = Object.getOwnPropertySymbols(object).find(sym => sym && sym.toString() === symbolString);
  if (symbol) {
    return object[symbol];
  }
  return undefined;
};
