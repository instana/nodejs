/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

require(process.env.INSTANA_COLLECTOR_PATH)({ agentPort: process.env.INSTANA_AGENT_PORT });
