/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */
'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./instana_init");
const config_1 = require("./config");
const express_1 = __importDefault(require("express"));
// @ts-ignore
const collector_1 = __importDefault(require("@instana/collector"));
const request_promise_1 = __importDefault(require("request-promise"));
let packageToRequire = '../..';
if (config_1.config.mode === 'npm') {
    packageToRequire = '@instana/collector';
}
if (config_1.config.collectorEnabled) {
    console.log(`enabling @instana/collector (requiring ${packageToRequire})`);
    (0, collector_1.default)({
        level: 'info',
        agentPort: config_1.config.agentPort,
        tracing: {
            enabled: config_1.config.tracingEnabled
        }
    });
}
else {
    console.log('NOT enabling @instana/collector');
}
const downstreamUrl = process.env.DOWNSTREAM_URL;
const app = (0, express_1.default)();
app.get('/', (req, res) => {
    if (config_1.config.logRequests) {
        console.log(`received request (${new Date()})`);
    }
    if (!downstreamUrl) {
        res.send('OK');
    }
    else {
        (0, request_promise_1.default)('http://localhost:8000/v1/helloworld')
            .then(downstreamResponse => {
            if (config_1.config.logRequests) {
                console.log(`downstream request successful (${new Date()})`);
            }
            res.json(downstreamResponse);
        })
            .catch(err => {
            console.error(`downstream request finished with error (${new Date()})`);
            console.error(err);
            res.status(502).send(err.stack);
        });
    }
});
app.get('/json', (req, res) => {
    if (config_1.config.logRequests) {
        console.log(`received request to /json (${new Date()})`);
    }
    res.json({
        firstName: 'Juan',
        lastName: 'Pérez',
        city: 'Barcelona',
        state: 'ES-CT'
    });
});
app.listen(config_1.config.appPort, () => {
    console.log('Listening on port', config_1.config.appPort);
});
