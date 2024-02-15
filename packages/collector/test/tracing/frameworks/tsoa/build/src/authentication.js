"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expressAuthentication = void 0;
class CustomError extends Error {
    constructor(msg) {
        super(msg);
        this.status = 401;
    }
}
/*
export function expressAuthentication(request: express.Request, securityName: string, scopes?: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (securityName === 'yyy') {
      const err = new CustomError('no way');
      console.log('err', err.status);
      return reject(err);
    }

    return resolve({});
  });
}
*/
async function expressAuthentication(request, securityName, scopes) {
    if (securityName === 'yyy') {
        const err = new CustomError('no way');
        throw err;
    }
}
exports.expressAuthentication = expressAuthentication;
