/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const usedPorts = {};
const MAX_PORT = 31000;
const MIN_PORT = 30000;
const getRandomNum = () => Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1) + MIN_PORT);

// Very naive way to ensure tests & apps use unique ports
// Searching for free ports on disk is A) slow and B) needs organisation in code e.g. app1 needs port form app2
module.exports = function findPort() {
  const number = getRandomNum();

  if (usedPorts[number]) {
    return findPort();
  }

  usedPorts[number] = true;
  return number;
};
