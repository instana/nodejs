/*
 * (c) Copyright IBM Corp. 2024
 */

import { register } from 'node:module';

register(import.meta.url);
const instana = await import(process.env.INSTANA_COLLECTOR_PATH);
instana.default();
