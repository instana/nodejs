import https from 'https';

export const handler = async event => {
  const url = new URL(`${process.env.INSTANA_ENDPOINT_URL}/bundle`);
  const numTries = 100;
  const delay = 1000;
  const responseTimes = [];
  const instanaKey = process.env.INSTANA_AGENT_KEY;

  const ping = () => {
    const body = JSON.stringify({ spans: [] });
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
        res.on('data', () => {});
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
      req.end();
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
