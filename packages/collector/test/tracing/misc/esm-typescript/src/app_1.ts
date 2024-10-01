import instana from '@instana/collector';

if (!instana.sdk) {
  throw new Error('instana.sdk does not exist.');
}

export default instana;
