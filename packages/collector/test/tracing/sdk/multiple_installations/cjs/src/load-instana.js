/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

require(process.env.INSTANA_COLLECTOR_PATH)({ agentPort: process.env.AGENT_PORT });
