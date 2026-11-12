#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// Developer CLI for the Instana Node.js repository. Add new tasks as modules in ./commands and register them below.
//
// Usage: node bin/dev-cli --help

// eslint-disable-next-line import/no-extraneous-dependencies
const yargs = require('yargs');

yargs(process.argv.slice(2))
  .scriptName('dev-cli')
  .command(require('./commands/cleanup-aws'))
  .demandCommand(1, 'Please specify a command.')
  .strict()
  .help()
  .parse();
