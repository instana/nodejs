/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('@instana/collector')();
const agentPort = process.env.INSTANA_AGENT_PORT;

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');

const port = require('@_instana/collector/test/test_util/app-port')();

const httpModule = process.env.APP_USES_HTTPS === 'true' ? require('https') : require('http');
const protocol = process.env.APP_USES_HTTPS === 'true' ? 'https' : 'http';
const baseUrl = `${protocol}://user:password@localhost:${process.env.SERVER_PORT}`;
const sslDir = path.join(path.dirname(require.resolve('@_instana/collector/package.json')), 'test', 'apps', 'ssl');
const key = fs.readFileSync(path.join(sslDir, 'key'));
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

const app = express();

const logPrefix = `Express/${protocol} Client (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.get('/request-url-and-options', (req, res) => {
  httpModule.request(createUrl(req, '/request-url-opts'), { ca: cert }, () => res.sendStatus(200)).end();
});

app.get('/request-url-only', (req, res) => {
  httpModule.request(createUrl(req, '/request-only-url'), () => res.sendStatus(200)).end();
});

app.get('/request-deferred', (req, res) => {
  setTimeout(() => {
    httpModule.get(`http://127.0.0.1:${agentPort}/ping?k=2`, () => {}).end();
  }, 500);

  httpModule.get(`http://127.0.0.1:${agentPort}/ping?k=1`, () => res.sendStatus(200)).end();
});

app.get('/request-options-only', (req, res) => {
  const downStreamQuery = {};
  if (req.query.withQuery) {
    downStreamQuery.q1 = 'some';
    downStreamQuery.pass = 'verysecret';
    downStreamQuery.q2 = 'value';
  }
  if (req.query.withHeader === 'response') {
    downStreamQuery.withHeader = 'response';
  }
  let downStreamQueryString = Object.keys(downStreamQuery)
    .map(k => `${k}=${downStreamQuery[k]}`)
    .join('&');
  if (downStreamQueryString.length > 0) {
    downStreamQueryString = `?${downStreamQueryString}`;
  }
  const downstreamRequest = {
    hostname: 'localhost',
    port: process.env.SERVER_PORT,
    method: 'GET',
    path: `/request-only-opts${downStreamQueryString}`,
    ca: cert
  };
  if (req.query.withHeader === 'request-via-options') {
    downstreamRequest.headers = {
      'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
      'x-my-exit-options-request-multi-header': [
        'x-my-exit-options-request-multi-header-value-1',
        'x-my-exit-options-request-multi-header-value-2'
      ],
      'x-exit-options-not-captured-header': 'whatever'
    };
  }
  const requestObject = httpModule.request(downstreamRequest, () => res.sendStatus(200));
  if (req.query.withHeader === 'set-on-request') {
    requestObject.setHeader('X-MY-EXIT-SET-ON-REQUEST-HEADER', 'x-my-exit-set-on-request-header-value');
    requestObject.setHeader('X-My-Exit-Set-On-Request-Multi-Header', [
      'x-my-exit-set-on-request-multi-header-value-1',
      'x-my-exit-set-on-request-multi-header-value-2'
    ]);
    requestObject.setHeader('x-my-exit-set-on-request-not-captured-jeader', 'whatever');
  }
  requestObject.end();
});

app.get('/request-options-only-null-headers', (req, res) => {
  httpModule
    .request(
      {
        hostname: 'localhost',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: `/request-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
        ca: cert,
        headers: null
      },
      () => res.sendStatus(200)
    )
    .end();
});

app.get('/get-url-and-options', (req, res) => {
  httpModule.get(createUrl(req, '/get-url-opts'), { ca: cert }, () => res.sendStatus(200));
});

app.get('/get-url-only', (req, res) => {
  httpModule.get(createUrl(req, '/get-only-url'), () => res.sendStatus(200));
});

app.get('/get-options-only', (req, res) => {
  httpModule.get(
    {
      hostname: 'localhost',
      port: process.env.SERVER_PORT,
      method: 'GET',
      path: `/get-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
      ca: cert
    },
    () => res.sendStatus(200)
  );
});

app.get('/timeout', (req, res) => {
  // Native fetch doesn't support credentials in URL, we use Authorization header
  const urlWithoutCreds = `${protocol}://localhost:${process.env.SERVER_PORT}/timeout`;
  const auth = Buffer.from('user:password').toString('base64');

  // Native fetch doesn't support timeout option, so we use AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 500);

  fetch(urlWithoutCreds, {
    method: 'GET',
    signal: controller.signal,
    headers: {
      Authorization: `Basic ${auth}`
    }
  })
    .then(() => {
      clearTimeout(timeoutId);
      res.sendStatus(200);
    })
    .catch(() => {
      clearTimeout(timeoutId);
      res.sendStatus(500);
    });
});

app.get('/deferred-http-exit', (req, res) => {
  // Send the response back first...
  res.sendStatus(200);
  setTimeout(
    () =>
      // ... and make another outgoing HTTP call after that.
      httpModule
        .request({
          hostname: 'localhost',
          port: process.env.SERVER_PORT,
          method: 'GET',
          path: '/request-only-opts',
          ca: cert
        })
        .end(),
    100
  );
});

app.get('/abort', (req, res) => {
  const clientRequest = httpModule.request({
    method: 'GET',
    hostname: 'localhost',
    port: process.env.SERVER_PORT,
    path: '/timeout',
    ca: cert
  });

  clientRequest.end();

  setTimeout(() => {
    clientRequest.abort();
    res.sendStatus(200);
  }, 1500);
});

app.get('/request-malformed-url', (req, res) => {
  try {
    httpModule
      .request(
        //
        'ha-te-te-peh://999.0.0.1:not-a-port/malformed-url', //
        { ca: cert }, //
        () => {
          // eslint-disable-next-line no-console
          console.log('This should not have happend!');
        }
      )
      .end();
  } catch (e) {
    httpModule
      .request(
        {
          hostname: 'localhost',
          port: process.env.SERVER_PORT,
          method: 'GET',
          path: `/request-only-opts${req.query.withQuery ? '?q1=some&pass=verysecret&q2=value' : ''}`,
          ca: cert
        },
        () => res.sendStatus(200)
      )
      .end();
  }
});

app.put('/expect-continue', (req, res) => {
  const continueRequest = httpModule.request(
    {
      hostname: 'localhost',
      port: process.env.SERVER_PORT,
      method: 'PUT',
      path: '/continue',
      ca: cert,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Expect: '100-continue'
      }
    },
    response => {
      let responseString = '';
      response.on('data', chunk => {
        responseString += chunk;
      });
      response.on('end', () => {
        res.send(responseString);
      });
    }
  );

  continueRequest.on('continue', () => {
    // send body
    continueRequest.end('{"content": "whatever"}');
  });
});

if (process.env.APP_USES_HTTPS === 'true') {
  require('https')
    .createServer({ key, cert }, app)
    .listen(port, () => {
      log(`Listening (HTTPS!) on port: ${port}`);
    });
} else {
  app.listen(port, () => {
    log(`Listening on port: ${port}`);
  });
}

app.get('/matrix-params/:params', (req, res) => {
  res.sendStatus(200);
});

app.get('/current-span', (req, res) => {
  const span = instana.currentSpan();
  const currentSpan = {
    spanConstructorName: span.span?.constructor?.name,
    span: span.span
  };
  res.status(200).json(currentSpan);
});

app.get('/downstream-call', (req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: agentPort,
    path: '/ping',
    method: 'GET'
  };

  log('Initiating downstream call to', `http://127.0.0.1:${agentPort}/ping`);

  const downstreamReq = httpModule.request(options, downstreamRes => {
    let data = '';
    downstreamRes.on('data', chunk => {
      data += chunk;
    });
    downstreamRes.on('end', () => {
      log('Downstream call completed with response:', data);
      res.status(200).json({ message: 'Downstream call completed', body: data });
    });
  });

  downstreamReq.on('error', err => {
    log('Error in downstream call:', err.message);
    res.sendStatus(500);
  });

  downstreamReq.end();
});

app.get('/without-port', (req, res) => {
  const options = {
    hostname: 'www.google.com',
    method: 'GET',
    path: '/search?q=nodejs',
    headers: {
      'User-Agent': 'Node.js'
    }
  };

  log(`Initiating call to ${options.hostname}`);

  const request = httpModule.request(options, response => {
    // eslint-disable-next-line no-unused-vars
    let data = '';
    response.on('data', chunk => {
      data += chunk;
    });
    response.on('end', () => {
      res.status(200).json({ message: 'Call completed' });
    });
  });

  request.on('error', err => {
    log('Error in downstream call:', err.message);
    res.sendStatus(500);
  });

  request.end();
});

function createUrl(req, urlPath) {
  const pathWithQuery = req.query.withQuery ? `${urlPath}?q1=some&pass=verysecret&q2=value` : urlPath;
  return req.query.urlObject ? new URL(pathWithQuery, baseUrl) : baseUrl + pathWithQuery;
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
