/*
 * (c) Copyright IBM Corp. 2026
 */

/**
 * IITM (import-in-the-middle) registration shim — loaded via --import.
 *
 */
import { register } from 'module';
import { addHook } from 'import-in-the-middle';

register('import-in-the-middle/hook.mjs', import.meta.url, {
  // uncomment this following line so that the issue will be gone
  // data: {
  //   include: ['@platformatic/kafka']
  // }
});

addHook((name, exports, specifier) => {
  console.log('HOOK:', name);
  console.log('EXPORTS:', Object.keys(exports));
  console.log('SPECIFIER:', specifier);

  const OriginalProducer = exports.Producer;

  if (OriginalProducer) {
    exports.Producer = class extends OriginalProducer {
      constructor(...args) {
        console.log('[Instana] Producer constructor');
        super(...args);
      }

      async send(...args) {
        console.log('[Instana] Producer.send()', JSON.stringify(args));

        return super.send(...args);
      }
    };
  }

  return exports;
});
