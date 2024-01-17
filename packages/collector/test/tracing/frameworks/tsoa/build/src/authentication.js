/* [object Object]
[object Object]
[object Object]
[object Object] */

'use strict';

const __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, '__esModule', { value: true });
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
function expressAuthentication(request, securityName, scopes) {
  return __awaiter(this, void 0, void 0, function* () {
    if (securityName === 'yyy') {
      const err = new CustomError('no way');
      throw err;
    }
  });
}
exports.expressAuthentication = expressAuthentication;
