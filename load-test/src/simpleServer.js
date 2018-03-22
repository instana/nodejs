'use strict';

// provides a simple http server without any special features
var http = require('http');

http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('OK');
}).listen(5000);
