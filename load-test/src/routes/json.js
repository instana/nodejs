'use strict';

exports.path = '/json';

exports.router = function StandardRoute(res) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    aNumber: 1,
    aString: 'string',
    anObject: {something: 'else'},
    aBoolean: true,
    aDate: new Date()
  }));
};

exports.connect = function() {
  return Promise.resolve();
};

exports.init = function() {
  return Promise.resolve();
};
