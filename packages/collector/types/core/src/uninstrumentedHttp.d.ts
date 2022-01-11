/// <reference types="node" />
declare const _exports: UninstrumentedHTTP;
export = _exports;
export type UninstrumentedHTTP = {
    http: typeof http & {
        agent: import('http').Agent;
    };
    https: typeof https;
};
import http = require("http");
import https = require("https");
