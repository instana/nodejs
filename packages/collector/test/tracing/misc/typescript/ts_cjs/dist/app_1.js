"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// sdk access
const collector_1 = __importDefault(require("@instana/collector"));
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const app_port_js_1 = __importDefault(require("../../../../../test_util/app-port.js"));
const port = (0, app_port_js_1.default)();
const logPrefix = `TS->CJS App (${process.pid}):\t`;
const agentPort = process.env.INSTANA_AGENT_PORT;
if (!collector_1.default.sdk) {
    throw new Error('instana.sdk does not exist.');
}
if (!collector_1.default.currentSpan) {
    throw new Error('instana.currentSpan does not exist.');
}
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
app.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.sendStatus(200);
}));
app.get('/request', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const currentSpan = collector_1.default.currentSpan();
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
//# sourceMappingURL=app_1.js.map