import instana from '@instana/serverless-collector';
import axios from 'axios';

setInterval(async () => {
  try {
    await instana.sdk.async.startEntrySpan('execution-time', 'custom', 'blalba');
    const response = await axios.get('https://jsonplaceholder.typicode.com/posts/1');
    instana.sdk.async.completeEntrySpan();
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}, 10 * 1000);
