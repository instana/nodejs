/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../src')({
  tracing: {
    allowRootExitSpan: true,
    useOpentelemetry: false
  }
});
const agentPort = process.env.INSTANA_AGENT_PORT;

function main() {
  setTimeout(async () => {
    await fetch(`http://127.0.0.1:${agentPort}`);
  }, 100);
}

main();
