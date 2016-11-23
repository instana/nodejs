'use strict';

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
