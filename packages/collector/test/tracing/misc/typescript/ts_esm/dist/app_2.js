var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// sdk access
import * as instana from '@instana/collector';
import express from 'express';
import bodyParser from 'body-parser';
import portFactory from '../../../../../test_util/app-port.js';
const port = portFactory();
const logPrefix = `TS->ESM App (${process.pid}):\t`;
const agentPort = process.env.INSTANA_AGENT_PORT;
if (!instana.default.sdk) {
    throw new Error('instana.sdk does not exist.');
}
if (!instana.default.currentSpan) {
    throw new Error('instana.currentSpan does not exist.');
}
const app = express();
app.use(bodyParser.json());
app.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.sendStatus(200);
}));
app.get('/request', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const currentSpan = instana.default.currentSpan();
    if (!currentSpan) {
        throw new Error('No current span available.');
    }
    yield fetch(`http://127.0.0.1:${agentPort}`);
    res.json({ success: true });
}));
app.listen(port, () => {
    log(`Listening on port: ${port}`);
});
function log(p0) {
    const args = Array.prototype.slice.call(arguments);
    args[0] = logPrefix + args[0];
    // eslint-disable-next-line no-console
    console.log.apply(console, args);
}
//# sourceMappingURL=app_2.js.map