#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable consistent-return */

'use strict';

require('@instana/core/test/test_util/mockRequireExpress');

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino')();

const { sendToParent } = require('../../../core/test/test_util');

const logPrefix = 'metadata-v1';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'info';

const baseUrl = '/computeMetadata/v1/';
const port = process.env.METADATA_MOCK_PORT;

const projectId = 'test-gcp-project';
const numericProjectId = 13027872031;
const region = 'us-central1';
const zone = `${region}-1`;
const fullyQualifiedRegion = `projects/${numericProjectId}/regions/${region}`;
const fullyQualifiedZone = `projects/${numericProjectId}/zones/${zone}`;
const instanceId =
  process.env.INSTANCE_ID ||
  // eslint-disable-next-line max-len
  '00bf4bf02da23aa66c43a397044cc49beeeade73374388d5cae046c298189b6398dab7d53d8f906fa9456f94da85c2c9fbf6d701234567890123456789';

const serviceAccounts = {
  [`${numericProjectId}Compute@developer.gserviceaccount.com`]: {
    aliases: ['default'],
    email: `${numericProjectId}-compute@developer.gserviceaccount.com`,
    scopes: [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/analytics',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/streetviewpublish',
      'https://www.googleapis.com/auth/urlshortener',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/youtube'
    ]
  },
  default: {
    aliases: ['default'],
    email: `${numericProjectId}-compute@developer.gserviceaccount.com`,
    scopes: [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/analytics',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/streetviewpublish',
      'https://www.googleapis.com/auth/urlshortener',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/youtube'
    ]
  }
};

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.use((req, res, next) => {
  const metadataFlavor = req.headers['metadata-flavor'];
  if (!metadataFlavor) {
    res.status(400).set('Content-Type', 'text/html').send('Missing Metadata-Flavor header.');
  } else if (metadataFlavor !== 'Google') {
    res.status(400).set('Content-Type', 'text/html').send(`Unknown Metadata-Flavor: ${metadataFlavor}`);
  } else {
    next();
  }
});

app.use(bodyParser.json());

const recursiveJsonEndpoints = [
  {
    endpoint: 'project',
    value: {
      numericProjectId,
      projectId
    }
  },
  {
    endpoint: 'instance',
    value: {
      id: instanceId,
      region: fullyQualifiedRegion,
      serviceAccounts,
      zone: fullyQualifiedZone
    }
  },
  {
    endpoint: 'instance/service-accounts/default/token',
    value: {
      access_token: '<redacted>',
      expires_in: 1799,
      token_type: 'Bearer'
    }
  },
  {
    endpoint: 'instance/service-accounts',
    value: serviceAccounts
  }
];

const textEndpoints = [
  {
    endpoint: 'project/numeric-project-id',
    value: numericProjectId
  },
  {
    endpoint: 'project/project-id',
    value: projectId
  },
  {
    endpoint: 'instance/id',
    value: instanceId
  },
  {
    endpoint: 'instance/zone',
    value: fullyQualifiedZone
  }
];

recursiveJsonEndpoints.forEach(({ endpoint, value }) => {
  app.get(`${baseUrl}${endpoint}`, (req, res) => {
    if (req.query.recursive === 'true') {
      res.json(value);
    } else {
      res.sendStatus(404);
    }
  });
});

textEndpoints.forEach(({ endpoint, value }) => {
  app.get(`${baseUrl}${endpoint}`, (req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(value);
  });
});

app.listen(port, () => {
  logger.info('Listening on port: %s', port);
  sendToParent('metadata mock: started');
});
