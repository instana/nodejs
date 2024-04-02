/*
 * (c) Copyright IBM Corp. 2024
 */

/**
 * ESM hooks supplied via loaders (--experimental-loader=@instana/collector/esm-loader.mjs) now run in a dedicated thread,
 * isolated from the main thread. Reference: https://github.com/nodejs/node/pull/44710
 * We loaded the tracer in the main thread with --import, we can extend the ESM hook with register method
 * in the future to extend the ESM support.
 *
 * Usage:
 *  ENV NODE_OPTIONS='--import /instana/node_modules/@instana/aws-fargate/register.mjs
 */

// import { register } from 'node:module';
// register(./loader.mjs, import.meta.url);

// Importing the Instana trace initialization module here, as this is the main thread.
import './src/index.js';
