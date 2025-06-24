import https from 'https';
import crypto from 'node:crypto';

const generateRandomId = function (length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

export const handler = async event => {
  const url = new URL('https://teal.instana.io/serverless/traces');
  const numTries = 10;
  const delay = 500; // 1 second

  const responseTimes = [];
  const createSpan = () => {
    return {
      t: generateRandomId(16),
      s: generateRandomId(16),
      p: null,
      n: 'node.http.client',
      k: 2,
      f: {
        e: '87894',
        h: '863b6483-dce3-4dce-ba55-ce905be3f447'
      },
      ec: 0,
      ts: Date.now(),
      d: 3,
      data: {
        http: {
          method: 'GET',
          url: 'http://some-host:3000/path/to/resource',
          status: 200
        }
      },
      stack: [
        {
          m: '<anonymous>',
          c: '/usr/src/app/collector/test/tracing/protocols/http/client/clientApp.js',
          n: 47
        },
        {
          m: '<anonymous>',
          c: '/usr/src/app/core/src/tracing/instrumentation/frameworks/express.js',
          n: 139
        },
        {
          m: 'Layer.handle [as handle_request]',
          c: '/usr/src/app/node_modules/express/lib/router/layer.js',
          n: 95
        },
        {
          m: 'next',
          c: '/usr/src/app/node_modules/express/lib/router/route.js',
          n: 137
        }
      ]
    };
  };
  const instanaKey = process.env.INSTANA_AGENT_KEY;
  const ping = () => {
    const noOfSpans = 20;
    const spans = [];

    for (let i = 0; i < noOfSpans; i++) {
      spans.push(createSpan());
    }

    const body = JSON.stringify(spans);

    console.log('Content Length', Buffer.byteLength(body));
    return new Promise(resolve => {
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-instana-key': instanaKey
        }
      };

      const start = Date.now();
      const req = https.request(options, res => {
        res.on('data', () => {}); // consume data
        res.on('end', () => {
          if (res.statusCode !== 200 && res.statusCode !== 204) {
            throw new Error('Not received 200. Received:' + res.statusCode);
          }

          const end = Date.now();
          resolve(end - start);
        });
      });

      req.on('error', () => {
        resolve(null);
      });

      req.write(body);

      req.end(); // send the request
    });
  };

  for (let i = 0; i < numTries; i++) {
    const time = await ping();
    if (time !== null) {
      responseTimes.push(time);
      console.log(`Try ${i + 1}: ${time} ms`);
    } else {
      console.log(`Try ${i + 1}: Failed`);
    }
    await new Promise(r => setTimeout(r, delay));
  }

  const average = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;

  console.log(`Average response time: ${average.toFixed(2)} ms`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Ping completed',
      averageResponseTimeMs: average.toFixed(2),
      successfulPings: responseTimes.length
    })
  };
};
