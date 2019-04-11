'use strict';

var secrets = require('../secrets');

exports.discardUrlParameters = function discardUrlParameters(url) {
  var index = getCharCountUntilOccurenceOfChar(url, '?');
  index = Math.min(index, getCharCountUntilOccurenceOfChar(url, '#'));
  index = Math.min(index, getCharCountUntilOccurenceOfChar(url, ';'));
  return url.substring(0, index);
};

function getCharCountUntilOccurenceOfChar(s, char) {
  var index = s.indexOf(char);
  return index === -1 ? s.length : index;
}

exports.filterParams = function filterParams(queryString) {
  if (!queryString || queryString === '') {
    return undefined;
  }
  if (typeof queryString !== 'string') {
    return queryString;
  }
  return queryString
    .split('&')
    .filter(function(param) {
      var key = param.split('=')[0];
      if (key) {
        return !secrets.isSecret(key);
      }
      return true;
    })
    .join('&');
};
