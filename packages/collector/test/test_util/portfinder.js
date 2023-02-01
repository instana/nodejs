/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const usedPorts = {};
const getRandomNum = () => Math.floor(Math.random() * (6000 - 3000 + 1) + 3000);

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
