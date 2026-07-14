/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const WRONG_REGION = 'eu-central-1';

// NOTE: Create/Use any bucket outside of eu-central-1!
if (!BUCKET_NAME) {
  console.error('ERROR: AWS_S3_BUCKET_NAME is not set.');
  process.exit(1);
}

let requestCount = 0;
const requestLog = [];

const originalRequest = https.request.bind(https);
https.request = function (options, callback) {
  requestCount++;
  const attempt = requestCount;

  if (options && typeof options === 'object' && options.headers) {
    const authKey = Object.keys(options.headers).find(k => k.toLowerCase() === 'authorization');
    const auth = authKey && options.headers[authKey];

    if (auth && auth.startsWith('AWS4')) {
      options.headers['X-Instana-T'] = 'aabbccddeeff0011';
      options.headers['X-Instana-S'] = '1122334455667788';

      const signedMatch = auth.match(/SignedHeaders=([^,\s]+)/);
      const signedHeaders = signedMatch ? signedMatch[1].toLowerCase().split(';') : [];
      const instanaInSigned = signedHeaders.includes('x-instana-t');

      const host = options.hostname || options.host || (options.path && options.path.split('/')[2]) || 'unknown';
      requestLog.push({ attempt, signedHeaders, instanaInSigned, host });

      console.log(`[v3] Request #${attempt} → ${host}`);
      console.log(`  SignedHeaders: ${signedHeaders.join(';')}`);
      console.log(`  X-Instana-T in SignedHeaders: ${instanaInSigned ? 'YES → Bug!' : 'no'}`);
    }
  }

  return originalRequest(options, callback);
};

const s3 = new S3Client({
  region: WRONG_REGION,
  followRegionRedirects: true,
  maxAttempts: 2
});

s3.send(
  new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: 'instana-signing-test-v3.txt',
    Body: Buffer.from(`instana-signing-test-v3-${Date.now()}`)
  })
)
  .then(result => console.log(`\nResult: OK httpStatusCode=${result.$metadata.httpStatusCode}`))
  .catch(err => console.log(`\nResult: ERROR ${err.name} — ${err.message.substring(0, 100)}`))
  .finally(() => {
    const anyBug = requestLog.some(l => l.instanaInSigned);
    console.log(`\nVerdict: ${anyBug ? 'BUG — x-instana-t leaked into SignedHeaders' : 'OK — v3 not affected'}`);
    requestLog.forEach(({ attempt, signedHeaders, host }) => {
      console.log(`  Request #${attempt} → ${host}: [${signedHeaders.join(', ')}]`);
    });
  });
