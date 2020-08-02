'use strict';

const { parse } = require('url');

const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = require('http2').constants;

module.exports = exports = function executeRouteHandler(routes, stream, headers) {
  const requestPath = headers[HTTP2_HEADER_PATH] || '/';
  const parsedUrl = parse(requestPath, true);

  if (!parsedUrl.pathname) {
    stream.respond({
      [HTTP2_HEADER_STATUS]: 400
    });
    stream.end();
    return;
  }

  const resource = routes[parsedUrl.pathname];

  if (!resource) {
    stream.respond({
      [HTTP2_HEADER_STATUS]: 404
    });
    stream.end();
    return;
  }

  const method = headers[HTTP2_HEADER_METHOD] || 'GET';

  const handler = resource[method];
  if (!handler) {
    stream.respond({
      [HTTP2_HEADER_STATUS]: 405
    });
    stream.end();
    return;
  }

  handler(stream, parsedUrl.query, headers);
};
