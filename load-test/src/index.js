/* eslint-disable no-console */
'use strict';
var config = require('./config');

// init instana sensor if needed for load test
if (config.instana.sensorEnabled) {
  try {
    require('instana-nodejs-sensor')({
      agentPort: config.instana.agentPort,
      level: 'info'
    });
  } catch (e) {
    console.error('Sensor could not be instantiated.', e);
  }
}

var glob = require('glob');
var path = require('path');
var http = require('http');
var url = require('url');

var routes = [];
glob.sync('./src/routes/*.js').forEach(function(file) {
  routes.push(require(path.resolve(file)));
});

var serverRoutes = routes.map(function(route) {
  return {
    path: route.path,
    router: route.router
  };
});

// connect to all necessary services
Promise.all(routes.map(function(route) {
  return route.connect();
}))
  // init all necessary services
  .then(function() {
    return Promise.all(routes.map(function(route) {
      return route.init();
    }));
  })
  .then(startServer)
  .catch(function(error) {
    console.error('Could not start load test ', error);
  });


function startServer() {
  http.createServer(function(req, res) {
    var parsedUrl = url.parse(req.url, true);
    var route = serverRoutes.filter(function(r) {
      return r.path === parsedUrl.pathname;
    });
    if (route.length === 0) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Route not found.');
    } else {
      route[0].router(res);
    }
  }).listen(config.server.port);
  console.info('Load Server running => http://127.0.0.1:' + config.server.port);
}
