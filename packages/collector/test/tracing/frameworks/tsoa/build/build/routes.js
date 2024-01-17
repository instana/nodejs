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
exports.RegisterRoutes = void 0;
/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
const runtime_1 = require('@tsoa/runtime');
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
const usersController_1 = require('./../src/usersController');
const authentication_1 = require('./../src/authentication');
// @ts-ignore - no great way to install types from subpackage
const promiseAny = require('promise.any');
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
const models = {
  User: {
    dataType: 'refObject',
    properties: {
      id: { dataType: 'double', required: true },
      email: { dataType: 'string', required: true },
      name: { dataType: 'string', required: true },
      status: {
        dataType: 'union',
        subSchemas: [
          { dataType: 'enum', enums: ['Happy'] },
          { dataType: 'enum', enums: ['Sad'] }
        ]
      },
      phoneNumbers: { dataType: 'array', array: { dataType: 'string' }, required: true }
    },
    additionalProperties: false
  },
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  'Pick_User.email-or-name-or-phoneNumbers_': {
    dataType: 'refAlias',
    type: {
      dataType: 'nestedObjectLiteral',
      nestedProperties: {
        email: { dataType: 'string', required: true },
        name: { dataType: 'string', required: true },
        phoneNumbers: { dataType: 'array', array: { dataType: 'string' }, required: true }
      },
      validators: {}
    }
  },
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  UserCreationParams: {
    dataType: 'refAlias',
    type: { ref: 'Pick_User.email-or-name-or-phoneNumbers_', validators: {} }
  }
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const validationService = new runtime_1.ValidationService(models);
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
function RegisterRoutes(app) {
  // ###########################################################################################################
  //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
  //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
  // ###########################################################################################################
  app.get(
    '/api/users/auth-error',
    authenticateMiddleware([{ yyy: [] }]),
    function UsersController_authError(request, response, next) {
      const args = {};
      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
      let validatedArgs = [];
      try {
        validatedArgs = getValidatedArgs(args, request, response);
        const controller = new usersController_1.UsersController();
        const promise = controller.authError.apply(controller, validatedArgs);
        promiseHandler(controller, promise, response, undefined, next);
      } catch (err) {
        return next(err);
      }
    }
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.get(
    '/api/users/:userId',
    authenticateMiddleware([{ xxx: [] }]),
    function UsersController_getUser(request, response, next) {
      const args = {
        userId: { in: 'path', name: 'userId', required: true, dataType: 'double' },
        name: { in: 'query', name: 'name', dataType: 'string' }
      };
      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
      let validatedArgs = [];
      try {
        validatedArgs = getValidatedArgs(args, request, response);
        const controller = new usersController_1.UsersController();
        const promise = controller.getUser.apply(controller, validatedArgs);
        promiseHandler(controller, promise, response, undefined, next);
      } catch (err) {
        return next(err);
      }
    }
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.post(
    '/api/users',
    authenticateMiddleware([{ xxx: [] }]),
    function UsersController_createUser(request, response, next) {
      const args = {
        requestBody: { in: 'body', name: 'requestBody', required: true, ref: 'UserCreationParams' }
      };
      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
      let validatedArgs = [];
      try {
        validatedArgs = getValidatedArgs(args, request, response);
        const controller = new usersController_1.UsersController();
        const promise = controller.createUser.apply(controller, validatedArgs);
        promiseHandler(controller, promise, response, undefined, next);
      } catch (err) {
        return next(err);
      }
    }
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.post(
    '/api/users/error/:anyId',
    authenticateMiddleware([{ yyyy: [] }]),
    function UsersController_createUsers(request, response, next) {
      const args = {
        requestBody: { in: 'body', name: 'requestBody', required: true, ref: 'UserCreationParams' }
      };
      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
      let validatedArgs = [];
      try {
        validatedArgs = getValidatedArgs(args, request, response);
        const controller = new usersController_1.UsersController();
        const promise = controller.createUsers.apply(controller, validatedArgs);
        promiseHandler(controller, promise, response, undefined, next);
      } catch (err) {
        return next(err);
      }
    }
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  function authenticateMiddleware(security = []) {
    return function runAuthenticationMiddleware(request, _response, next) {
      return __awaiter(this, void 0, void 0, function* () {
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        // keep track of failed auth attempts so we can hand back the most
        // recent one.  This behavior was previously existing so preserving it
        // here
        const failedAttempts = [];
        const pushAndRethrow = error => {
          failedAttempts.push(error);
          throw error;
        };
        const secMethodOrPromises = [];
        for (const secMethod of security) {
          if (Object.keys(secMethod).length > 1) {
            const secMethodAndPromises = [];
            for (const name in secMethod) {
              secMethodAndPromises.push(
                (0, authentication_1.expressAuthentication)(request, name, secMethod[name]).catch(pushAndRethrow)
              );
            }
            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
            secMethodOrPromises.push(
              Promise.all(secMethodAndPromises).then(users => {
                return users[0];
              })
            );
          } else {
            for (const name in secMethod) {
              secMethodOrPromises.push(
                (0, authentication_1.expressAuthentication)(request, name, secMethod[name]).catch(pushAndRethrow)
              );
            }
          }
        }
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        try {
          request['user'] = yield promiseAny(secMethodOrPromises);
          next();
        } catch (err) {
          // Show most recent error as response
          const error = failedAttempts.pop();
          error.status = error.status || 401;
          next(error);
        }
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
      });
    };
  }
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  function isController(object) {
    return 'getHeaders' in object && 'getStatus' in object && 'setStatus' in object;
  }
  function promiseHandler(controllerObj, promise, response, successStatus, next) {
    return Promise.resolve(promise)
      .then(data => {
        let statusCode = successStatus;
        let headers;
        if (isController(controllerObj)) {
          headers = controllerObj.getHeaders();
          statusCode = controllerObj.getStatus() || statusCode;
        }
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        returnHandler(response, statusCode, data, headers);
      })
      .catch(error => next(error));
  }
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  function returnHandler(response, statusCode, data, headers = {}) {
    if (response.headersSent) {
      return;
    }
    Object.keys(headers).forEach(name => {
      response.set(name, headers[name]);
    });
    if (data && typeof data.pipe === 'function' && data.readable && typeof data._read === 'function') {
      data.pipe(response);
    } else if (data !== null && data !== undefined) {
      response.status(statusCode || 200).json(data);
    } else {
      response.status(statusCode || 204).end();
    }
  }
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  function responder(response) {
    return function (status, data, headers) {
      returnHandler(response, status, data, headers);
    };
  }
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  function getValidatedArgs(args, request, response) {
    const fieldErrors = {};
    const values = Object.keys(args).map(key => {
      const name = args[key].name;
      switch (args[key].in) {
        case 'request':
          return request;
        case 'query':
          return validationService.ValidateParam(args[key], request.query[name], name, fieldErrors, undefined, {
            noImplicitAdditionalProperties: 'throw-on-extras'
          });
        case 'path':
          return validationService.ValidateParam(args[key], request.params[name], name, fieldErrors, undefined, {
            noImplicitAdditionalProperties: 'throw-on-extras'
          });
        case 'header':
          return validationService.ValidateParam(args[key], request.header(name), name, fieldErrors, undefined, {
            noImplicitAdditionalProperties: 'throw-on-extras'
          });
        case 'body':
          return validationService.ValidateParam(args[key], request.body, name, fieldErrors, undefined, {
            noImplicitAdditionalProperties: 'throw-on-extras'
          });
        case 'body-prop':
          return validationService.ValidateParam(args[key], request.body[name], name, fieldErrors, 'body.', {
            noImplicitAdditionalProperties: 'throw-on-extras'
          });
        case 'formData':
          if (args[key].dataType === 'file') {
            return validationService.ValidateParam(args[key], request.file, name, fieldErrors, undefined, {
              noImplicitAdditionalProperties: 'throw-on-extras'
            });
          } else if (args[key].dataType === 'array' && args[key].array.dataType === 'file') {
            return validationService.ValidateParam(args[key], request.files, name, fieldErrors, undefined, {
              noImplicitAdditionalProperties: 'throw-on-extras'
            });
          } else {
            return validationService.ValidateParam(args[key], request.body[name], name, fieldErrors, undefined, {
              noImplicitAdditionalProperties: 'throw-on-extras'
            });
          }
        case 'res':
          return responder(response);
      }
    });
    if (Object.keys(fieldErrors).length > 0) {
      throw new runtime_1.ValidateError(fieldErrors, '');
    }
    return values;
  }
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}
exports.RegisterRoutes = RegisterRoutes;
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
