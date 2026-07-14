/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const https = require('https');
const http = require('http');
const AWS = require('aws-sdk');

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const WRONG_REGION = 'eu-central-1';

if (!BUCKET_NAME) {
  console.error('ERROR: AWS_S3_BUCKET_NAME is not set.');
  process.exit(1);
}

let requestCount = 0;
const requestLog = [];

function patchHttpModule(mod, label) {
  const original = mod.request.bind(mod);
  mod.request = function (options, callback) {
    requestCount++;
    const attempt = requestCount;

    if (options && typeof options === 'object' && options.headers) {
      const authKey = Object.keys(options.headers).find(k => k.toLowerCase() === 'authorization');
      const auth = authKey && options.headers[authKey];

      if (auth && auth.startsWith('AWS')) {
        options.headers['X-Instana-T'] = 'aabbccddeeff0011';
        options.headers['X-Instana-S'] = '1122334455667788';

        const signedMatch = auth.match(/SignedHeaders=([^,\s]+)/);
        const signedHeaders = signedMatch ? signedMatch[1].split(';') : [];
        const instanaInSigned = signedHeaders.includes('x-instana-t');

        requestLog.push({ attempt, label, signedHeaders, instanaInSigned, host: options.hostname || options.host });

        console.log(`[${label}] Request #${attempt} → ${options.hostname || options.host}`);
        console.log(`  SignedHeaders: ${signedHeaders.join(';') || '(none)'}`);
        console.log(`  X-Instana-T in SignedHeaders: ${instanaInSigned ? 'YES → Bug!' : 'no'}`);
      }
    }

    return original(options, callback);
  };
}

patchHttpModule(https, 'https');
patchHttpModule(http, 'http');

const s3 = new AWS.S3({ apiVersion: '2006-03-01', region: WRONG_REGION, maxRetries: 1 });

s3.upload(
  { Bucket: BUCKET_NAME, Key: 'instana-signing-test.txt', Body: Buffer.from(`instana-signing-test-${Date.now()}`) },
  function (err, result) {
    if (err) {
      console.log(`\nResult: ERROR ${err.code} — ${err.message.substring(0, 100)}`);
    } else {
      console.log(`\nResult: OK ${result.Location}`);
    }

    const anyBug = requestLog.some(l => l.instanaInSigned);
    console.log(`\nVerdict: ${anyBug ? 'BUG — x-instana-t leaked into SignedHeaders' : 'OK — no leak'}`);
    requestLog.forEach(({ attempt, label, signedHeaders, host }) => {
      console.log(`  Request #${attempt} (${label}) → ${host}: [${signedHeaders.join(', ') || 'none'}]`);
    });
  }
);
