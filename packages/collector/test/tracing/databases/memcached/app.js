/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

require('@instana/collector')();

const Memcached = require('memcached')
const express = require('express');
const app = express();
const port = require('@_instana/collector/test/test_util/app-port')();
const log = require('@_instana/core/test/test_util/log').getLogger(`Memcached (${process.pid}):\t`);
const memcached = new Memcached(process.env.MEMCACHED || 'localhost:11211');

/**
 * These arrays are used to build the call to the memcached lib, by using apply + a callback function
 * Eg: memcached.add('some_time', 200, 120)
 * Where: 'some_time' is the key, 200 is the value and 120 is the time in seconds that the record will exist
 */

const availableOperations = {
  add: ['some_time', 200, 120],
  set: ['some_time', 200, 120],
  append: ['some_time', 1],
  prepend: ['some_time', 1],
  touch: ['some_time', 120],
  replace: ['some_time', 100, 120],
  get: ['some_time'],
  getMulti: [['some_time', 'color']],
  gets: ['some_time'],
  incr: ['some_time', 5],
  decr: ['some_time', 5],
  del: ['some_time'],
  cas: ['some_time', 150, 'CAS_VALUE', 120]
};

const operationNames = Object.keys(availableOperations);

function makeHTTPCall(data, cb) {
  fetch(`http://127.0.0.1:${agentPort}/ping`)
    .then(() => {
      log('HTTP request made after interacting with memcached');
      cb(null, data);
    })
    .catch(cb);
}

function execOperation(op, withError, cb) {
  const operation = availableOperations[op];

  if (!operation) {
    throw new Error(`Operation "${op}" not found`);
  }

  if (withError) {
    operation[0] = op === 'getMulti' ? [{}, {}] : {};
  }

  if (op === 'cas') {
    execOperation('gets', withError, (err, data) => {
      if (err) {
        throw err;
      }
      if (data) {
        operation[2] = withError ? -666 : data.cas;
        memcached[op].apply(
          memcached,
          operation.concat((err2, data2) => {
            if (err2) {
              cb(err2);
            } else {
              setTimeout(() => {
                makeHTTPCall(data2, cb);
              }, 200);
            }
          })
        );
      }
    });
  } else {
    memcached[op].apply(
      memcached,
      operation.concat((err, data) => {
        if (err) {
          cb(err);
        } else {
          setTimeout(() => {
            makeHTTPCall(data, cb);
          }, 200);
        }
      })
    );
  }
}

function httpError(res, err) {
  res.status(500).send({
    status: 'failed',
    error: err
  });
}

function httpSuccess(res, data) {
  res.send({
    status: 'ok',
    data: data
  });
}

operationNames.forEach(operation => {
  app.get(`/${operation}`, (req, res) => {
    const withError = req.query.withError === 'true';

    execOperation(operation, withError, (err, result) => {
      if (err) {
        httpError(res, String(err));
      } else {
        httpSuccess(res, {
          operation,
          result
        });
      }
    });
  });
});

app.get('/', (_req, res) => {
  res.send('Ok');
});

app.listen(port, () => {
  log(`Memcached test app started at port ${port}`);
});
