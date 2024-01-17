/* [object Object]
[object Object]
[object Object]
[object Object] */

'use strict';

const __decorate =
  (this && this.__decorate) ||
  function (decorators, target, key, desc) {
    const c = arguments.length;
      let r = c < 3 ? target : desc === null ? (desc = Object.getOwnPropertyDescriptor(target, key)) : desc;
      let d;
    if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function') r = Reflect.decorate(decorators, target, key, desc);
    else for (let i = decorators.length - 1; i >= 0; i--) if ((d = decorators[i])) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
  };
const __param =
  (this && this.__param) ||
  function (paramIndex, decorator) {
    return function (target, key) {
      decorator(target, key, paramIndex);
    };
  };
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
exports.UsersController = void 0;
const tsoa_1 = require('tsoa');
const userService_1 = require('./userService');
let UsersController = class UsersController extends tsoa_1.Controller {
  authError() {
    return __awaiter(this, void 0, void 0, function* () {

    });
  }

  getUser(userId, name) {
    return __awaiter(this, void 0, void 0, function* () {
      return new userService_1.UsersService().get(userId, name);
    });
  }

  createUser(requestBody) {
    return __awaiter(this, void 0, void 0, function* () {
      this.setStatus(201); // set return status 201
      new userService_1.UsersService().create(requestBody);
    });
  }

  createUsers(requestBody) {
    return __awaiter(this, void 0, void 0, function* () {
      this.setStatus(201); // set return status 201
      new userService_1.UsersService().create(requestBody);
    });
  }
};
__decorate(
  [
    (0, tsoa_1.SuccessResponse)('200', 'Created'), // Custom success response
    (0, tsoa_1.Get)('/auth-error'),
    (0, tsoa_1.Security)('yyy')
  ],
  UsersController.prototype,
  'authError',
  null
);
__decorate(
  [
    (0, tsoa_1.Get)('{userId}'),
    (0, tsoa_1.Security)('xxx'),
    __param(0, (0, tsoa_1.Path)()),
    __param(1, (0, tsoa_1.Query)())
  ],
  UsersController.prototype,
  'getUser',
  null
);
__decorate(
  [
    (0, tsoa_1.SuccessResponse)('201', 'Created'), // Custom success response
    (0, tsoa_1.Post)(),
    (0, tsoa_1.Security)('xxx'),
    __param(0, (0, tsoa_1.Body)())
  ],
  UsersController.prototype,
  'createUser',
  null
);
__decorate(
  [
    (0, tsoa_1.SuccessResponse)('201', 'Created'), // Custom success response
    (0, tsoa_1.Post)('/error/{anyId}'),
    (0, tsoa_1.Security)('yyyy'),
    __param(0, (0, tsoa_1.Body)())
  ],
  UsersController.prototype,
  'createUsers',
  null
);
UsersController = __decorate([(0, tsoa_1.Route)('api/users')], UsersController);
exports.UsersController = UsersController;
