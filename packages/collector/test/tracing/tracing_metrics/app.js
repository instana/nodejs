'use strict';

const instana = require('../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: process.env.FORCE_TRANSMISSION_STARTING_AT
      ? parseInt(process.env.FORCE_TRANSMISSION_STARTING_AT, 10)
      : 1,
    maxBufferedSpans: process.env.MAX_BUFFERED_SPANS ? parseInt(process.env.MAX_BUFFERED_SPANS, 10) : 1000
  }
});

const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const app = express();
const logPrefix = `Tracing Metrics: (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/create-spans', (req, res) => {
  setTimeout(() => {
    instana.sdk.callback.startExitSpan('exit-1', () => {
      setTimeout(() => {
        instana.sdk.callback.completeExitSpan();
        instana.sdk.callback.startExitSpan('exit-2', () => {
          setTimeout(() => {
            instana.sdk.callback.completeExitSpan();
            instana.sdk.callback.startExitSpan('exit-3', () => {
              setTimeout(() => {
                instana.sdk.callback.completeExitSpan();
                res.sendStatus(200);
              });
            });
          });
        });
      });
    });
  });
});

app.post('/create-unfinished-spans', (req, res) => {
  setTimeout(() => {
    instana.sdk.callback.startExitSpan('exit-1', () => {
      setTimeout(() => {
        // The span exit-1 will be finished and transmitted.
        instana.sdk.callback.completeExitSpan();
        instana.sdk.callback.startExitSpan('exit-2', () => {
          setTimeout(() => {
            // The span exit-2 will _not_ be finished.
            // Due to this, exit-3 will not even be started.
            instana.sdk.callback.startExitSpan('exit-3', () => {
              setTimeout(() => {
                res.sendStatus(200);
              });
            });
          });
        });
      });
    });
  });
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
