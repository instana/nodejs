"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// app.ts
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const routes_1 = require("../build/routes");
exports.app = (0, express_1.default)();
// Use body parser to read sent json payloads
exports.app.use(body_parser_1.default.urlencoded({
    extended: true
}));
exports.app.use(body_parser_1.default.json());
exports.app.use(function anyMiddleware(req, res, next) {
    // NOTE: early exit in a middleware
    if (req.path === '/api/users/error/22') {
        res.sendStatus(200);
        return;
    }
    next();
});
exports.app.get('/', (req, res) => {
    res.sendStatus(200);
});
(0, routes_1.RegisterRoutes)(exports.app);
exports.app.use(function errorHandler(err, req, res, next) {
    if (err instanceof Error) {
        // @ts-expect-error
        return res.status(err.status || 200).json({
            message: 'error damn'
        });
    }
    next();
});
