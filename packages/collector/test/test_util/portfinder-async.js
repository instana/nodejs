/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const portfinder = require('portfinder');
const minPort = process.env.MIN_PORT;

(async () => {
  const port = await portfinder.getPortPromise({
    port: minPort, // minimum port
    stopPort: 10000 // maximum port
  });
  // eslint-disable-next-line no-console
  console.log(port);
})();
