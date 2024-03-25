/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const portfinder = require('portfinder');
const minPort = process.env.MIN_PORT;

// console.log('MinPort is', minPort);

(async () => {
  const port = await portfinder.getPortPromise({
    port: minPort, // minimum port
    stopPort: 10000 // maximum port
  });
  console.log(port);
})();
