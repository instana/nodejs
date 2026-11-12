/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const yargs = require('yargs');

yargs(process.argv.slice(2))
  .scriptName('dev-cli')
  .command(require('./commands/cleanup-aws'))
  .demandCommand(1, 'Please specify a command.')
  .strict()
  .help()
  .parse();
