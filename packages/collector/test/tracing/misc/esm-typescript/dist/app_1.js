"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const collector_1 = __importDefault(require("@instana/collector"));
if (!collector_1.default.sdk) {
    throw new Error('instana.sdk does not exist.');
}
exports.default = collector_1.default;
//# sourceMappingURL=app_1.js.map