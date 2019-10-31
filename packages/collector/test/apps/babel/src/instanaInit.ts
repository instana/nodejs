const agentPort: string = process.env.AGENT_PORT || '3215';

require('../../../..')({
  agentPort: agentPort,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});
