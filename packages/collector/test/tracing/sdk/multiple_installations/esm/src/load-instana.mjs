/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const instana = await import(process.env.INSTANA_COLLECTOR_PATH);
instana.default();
