/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
    process.disconnect();
    process.exit(0);
});

import ioredis from 'ioredis';
import { delay } from '@_local/core/test/test_util';

const logPrefix = `IORedis allowRootExitSpan App (${process.pid}):\t`;

log(logPrefix);

(async function connectRedis() {
    await delay(1000);

    try {
        const client = new ioredis(`//${process.env.INSTANA_CONNECT_REDIS}`);

        client.on('error', err => {
            log('IORedis client error:', err);
        });

        client.on('ready', () => {
            log(`Connected to client 1 (${process.env.INSTANA_CONNECT_REDIS}).`);
        });

        const multi = await client.multi().set('key', 'value').get('key').exec();
        log('multi result: %s', multi);

        await client.quit();
    } catch (err) {
        log('Failed to connect to IORedis:', err);
    }
})();

function log() {
    /* eslint-disable no-console */
    const args = Array.prototype.slice.call(arguments);
    args[0] = logPrefix + args[0];
    console.log.apply(console, args);
}
