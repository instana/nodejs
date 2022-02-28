"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expressAuthentication = void 0;
class CustomError extends Error {
    constructor(msg) {
        super(msg);
        this.status = 200;
    }
}
function expressAuthentication(request, securityName, scopes) {
    return new Promise((resolve, reject) => {
        if (securityName === 'yyy') {
            const err = new CustomError('no way');
            console.log('err', err.status);
            return reject(err);
        }
        return resolve({});
    });
}
exports.expressAuthentication = expressAuthentication;
