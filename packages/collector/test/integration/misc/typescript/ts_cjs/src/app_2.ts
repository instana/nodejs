// sdk access
import * as instana from '@instana/collector';
import express from 'express';
import bodyParser from 'body-parser';
import portFactory from '../../../../../test_util/app-port.js';

const port = portFactory();

const logPrefix = `TS->CJS App (${process.pid}):\t`;
const agentPort = process.env.INSTANA_AGENT_PORT;

if (!instana.sdk) {
  throw new Error('instana.sdk does not exist.');
}

if (!instana.currentSpan) {
  throw new Error('instana.currentSpan does not exist.');
}

const app = express();

app.use(bodyParser.json());

app.get('/', async (req, res) => {
  res.sendStatus(200);
});

app.get('/request', async (req, res) => {
  const currentSpan = instana.currentSpan();

  if (!currentSpan || !currentSpan.span || !currentSpan.span.t) {
    throw new Error('No current span available.');
  }

  await fetch(`http://127.0.0.1:${agentPort}/ping`);
  res.json({ success: true });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log(p0: string) {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
