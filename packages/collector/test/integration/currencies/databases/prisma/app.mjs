/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import { PrismaClient } from '@prisma/client';
import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import getAppPort from '@_local/collector/test/test_util/app-port.js';
const port = getAppPort();
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const logPrefix = `Prisma App (${process.pid}):\t`;

import log from '@instana/core/test/test_util/log.js';

const logger = log.getLogger(logPrefix);

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

let prisma;

try {
  const version = process.env.LIBRARY_VERSION;
  const isLatest = process.env.LIBRARY_LATEST === 'true';
  const provider = process.env.PROVIDER;

  const useAdapter = isLatest;
  let adapter = null;

  if (useAdapter) {
    if (provider === 'postgresql') {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      adapter = new PrismaPg({ connectionString: process.env.PRISMA_POSTGRES_URL });
      console.log(`Initialized Prisma ${version} with PostgreSQL adapter`);
    } else {
      const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const dbPath = path.resolve(__dirname, 'dev.db');
      adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
      console.log(`Initialized Prisma ${version} with SQLite adapter`);
    }

    prisma = new PrismaClient({ adapter });
  } else {
    prisma = new PrismaClient();
  }
} catch (err) {
  console.log('Error initializing Prisma, using default connection:', err.message);
  prisma = new PrismaClient();
}

let ready = false;

async function initDatabase() {
  try {
    await prisma.person.deleteMany({});
    await prisma.person.create({
      data: {
        name: 'Brainy Smurf'
      }
    });
    logger('database initialized');
    ready = true;
  } catch (err) {
    logger('Could not initialize underlying database.', err);
  }
}

initDatabase();

app.get('/', (req, res) => {
  if (ready) {
    return res.sendStatus(204);
  } else {
    return res.sendStatus(503);
  }
});

app.get('/findMany', async (req, res) => {
  const error = req.query.error;
  try {
    if (error) {
      const person = await prisma.person.findFirst({
        where: {
          // will trigger an error since there is no "email" attribute, only "name"
          email: 'brainy@smurf.org'
        }
      });
      res.send(person.toString());
    } else {
      const people = await prisma.person.findMany();
      res.json(people);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/update', async (req, res) => {
  try {
    const createResult = await prisma.person.create({
      data: {
        name: 'Smurvette'
      }
    });
    const updateResult = await prisma.person.update({
      where: {
        id: createResult.id
      },
      data: {
        name: 'Smurfette'
      }
    });
    const deleteResult = await prisma.person.deleteMany({
      where: {
        name: 'Smurfette'
      }
    });
    res.json({ createResult, updateResult, deleteResult });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(port, () => {
  logger(`Listening on port: ${port}`);
});
