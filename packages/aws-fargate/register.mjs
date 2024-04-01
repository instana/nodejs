/*
 * (c) Copyright IBM Corp. 2024
 */

import { register } from 'node:module';
// Registering the current module using its absolute path
// This step is essential for Node.js to properly resolve and load ESM modules
// loaders are off threaded! https://instana.slack.com/archives/G0118PFNN20/p1708556683665099
register(import.meta.url);
// Initializes the trace here, as this is the main thread.
// As soon as we enter the register function, it's off-threaded.
import './src/index.js';
