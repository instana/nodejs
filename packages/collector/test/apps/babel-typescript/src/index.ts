// This is relevant if you transpile your code with a transpiler like Babel, Traceur, Rollup, Webpack or the
// TypeScript compiler (tsc), and in particular if you use it to transpile ES6 `import` statements. Just putting
// something like this at the top of your main file will not work in such a setup:
//
//     import instana from '@instana/collector';
//
//     instana();
//
//     import express from 'express';
//
// Why not? According to the ES6 spec, *all imports are evaluated before the body of the module is executed*. Babel and
// other transpilers comply with this rule and move _all_ imports to the top when transpiling source files. All actual
// statments will be put after the imports. As a consequence, the import for `express` in this example will be placed
// before the `instana();` call. You will end up with something like this in your transpiled file:
//
//     var _instana = _interopRequireDefault(require("@_local/collector"));
//
//     var _express = _interopRequireDefault(require("express"));
//
//     var _morgan = _interopRequireDefault(require("morgan"));
//
//     function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
//
//     (0, _instana.default)();
//
//     ...
//
// As you can see, the actual call to the @instana/collector's init function comes after all require statements in the
// transpiled file.
//
// Instead, you can do something like this:
//
//     // Put this import at the top of your main file. Only the import here,
//     // don't change this to "import instana from './instanaInit'"!
//     import './instanaInit';
//
//     // Now all the other imports can follow:
//     import express from 'express';
//     import morgan from 'morgan';
//
//     // The following statement is optional; it is only required if you want to use
//     // Instana's Node.js API (https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-instana-api):
//     @ts-ignore (in case you are using TypeScript, to avoid 'Could not find a declaration for '@instana/collector')
//     import instana from '@instana/collector';
//
// The file `instanaInit.js` (or `instanaInit.ts` if you use TypeScript) should just have this one statement:
//
//     require('@instana/collector')();
//
// This way, the init function is called right away when the process starts.
//
// In general, when using any transpiler, it is a good idea to inspect the transpiled sources when
// integrating @instana/collector.

// Put this import at the top of your main file. Only the import here,
// don't change this to "import instana from './instanaInit'"!
import './instanaInit';

// Now all the other imports can follow:
import express from 'express';
import morgan from 'morgan';

// The following statement is optional; it is only required if you want to use
// Instana's Node.js API (https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-instana-api):
// @ts-ignore
import instana from '@instana/collector';

// @ts-ignore
import getAppPort from '../../../test_util/app-port.js';

const app = express();
const port = getAppPort();

const logPrefix = `Express App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(port, () => {
  console.log(`Listening on port: ${port}`);
});
