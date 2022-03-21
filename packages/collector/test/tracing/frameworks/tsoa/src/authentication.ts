import * as express from 'express';

class CustomError extends Error {
  status: number;

  constructor(msg: string | undefined) {
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

export async function expressAuthentication(request: express.Request, securityName: string, scopes?: string[]) {
  if (securityName === 'yyy') {
    const err = new CustomError('no way');
    throw err;
  }
}
