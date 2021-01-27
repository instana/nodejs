/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// This file exists to avoid dependency cycles between:
// logger => agent/bunyanToAgentStream => pidStore/index => logger

/**
 * Is set to process.pid on startup but can later be changed, either by us finding our own PID in the parent namespace
 * (that is, on the actual host when this process runs in a container) by examining /proc/{PID}/sched) or by overwriting
 * it with the PID from the agent's response.
 */
exports.pid = process.pid;
