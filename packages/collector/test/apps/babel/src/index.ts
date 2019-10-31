// Just putting something like this at the top of your main TS file does not work, when babel is used to
// transpile the sources:
//     // @ts-ignore
//     import instana from '@instana/collector';
//
//     instana();
//
//     import express from 'express';
//
// Why not? According to the EcmaScript spec, *all imports are evaluated before the body of the module is executed*.
// Babel complies with this rule and moves _all_ imports to the top when transpiling this. All actual statments will be
// put after the imports. That means, the import for express etc. will be
// placed before the initialization call. You will end up with something like this in your compiled file:
//
//     var _instana = _interopRequireDefault(require("@instana/collector"));
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
// Instead, do something like this:
//
//     // just the import, no "import instana from './instanaInit'"
//     import './instanaInit';
//
//     import express from 'express';
//     import morgan from 'morgan';
//
// and the file instanaInit.ts just this one line:
//
//     require('@instana/collector')();
//
// This way, the init function is called right away when the process starts.
//
// In general, when using Babel or really any transpiler (also tsc, webpack, ...) it it a good idea to inspect the
// transpiled sources when integrating @instana/collector.

import './instanaInit';

import express from 'express';
import morgan from 'morgan';

const app = express();

const logPrefix = `Express App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(process.env.APP_PORT, () => {
  console.log(`Listening on port: ${process.env.APP_PORT}`);
});
