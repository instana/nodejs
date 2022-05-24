/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const repoRootDir = process.env.INSTANA_NODES_REPO;
if (!repoRootDir) {
  throw new Error('Mandatory environment variable INSTANA_NODES_REPO is not set.');
}

// eslint-disable-next-line import/no-unresolved
const instana = require('@instana/collector');
const dependenciesModule = require(`${repoRootDir}/packages/shared-metrics/src/dependencies`);
dependenciesModule.MAX_DEPENDENCIES = 200;
dependenciesModule.MAX_ATTEMPTS = 1;
instana();

const { getLogger } = require(`${repoRootDir}/packages/core/test/test_util/log`);

const express = require('express');

const logPrefix = `Dependencies App (${process.pid}):\t`;
const log = getLogger(logPrefix);

const app = express();

app.get('/', (req, res) => res.sendStatus(200));

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});
