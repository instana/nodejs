#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

if (parseInt(/v(\d+)\./.exec(process.version)[1], 10) >= 10) {
  process.exit(1);
} else {
  process.exit(0);
}
