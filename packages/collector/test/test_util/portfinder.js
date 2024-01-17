/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const usedPorts = {};
const callerPath = require('caller-path');
const getRandomNum1 = () => Math.floor(Math.random() * (31000 - 30000 + 1) + 30000);
const getRandomNum2 = () => Math.floor(Math.random() * (600 - 300 + 1) + 300);

// Very naive way to ensure tests & apps use unique ports
// Searching for free ports on disk is A) slow and B) needs organisation in code e.g. app1 needs port form app2
module.exports = function findPort() {
  let number;

  if (process.env.MOCHA_WORKER_ID) {
    number = getRandomNum2() + process.env.MOCHA_WORKER_ID;
  } else {
    number = getRandomNum1();
  }

  // console.log(callerPath());
  // console.log(number);

  if (usedPorts[number]) {
    return findPort();
  }

  usedPorts[number] = true;
  return number;
};
