#!/usr/bin/env node

'use strict';

if (parseInt(/v(\d+)\./.exec(process.version)[1], 10) >= 10) {
  process.exit(1);
} else {
  process.exit(0);
}
