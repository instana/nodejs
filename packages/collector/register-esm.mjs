/*
 * (c) Copyright IBM Corp. 2024
 */

import { register } from 'node:module';

register(import.meta.url);
import instana from './src/index.js';
instana();
