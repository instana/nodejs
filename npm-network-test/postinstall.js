 const https = require('https');

const url = 'https://opentelemetry.io';

console.log(`[npm-network-test] Trying to access ${url}`);

https
  .get(url, res => {
    console.log(`[npm-network-test] NETWORK ACCESS: HTTP ${res.statusCode}`);
    res.resume();
  })
  .on('error', err => {
    console.log(`[npm-network-test] NETWORK BLOCKED: ${err.message}`);
  });