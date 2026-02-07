"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const tsoa_1 = require("tsoa");
const userService_1 = require("./userService");
let UsersController = class UsersController extends tsoa_1.Controller {
    async authError() {
        return;
    }
    async getUser(userId, name) {
        return new userService_1.UsersService().get(userId, name);
    }
    async createUser(requestBody) {
        this.setStatus(201); // set return status 201
        new userService_1.UsersService().create(requestBody);
        return;
    }
    async createUsers(requestBody) {
        this.setStatus(201); // set return status 201
        new userService_1.UsersService().create(requestBody);
        return;
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, tsoa_1.SuccessResponse)('200', 'Created') // Custom success response
    ,
    (0, tsoa_1.Get)('/auth-error'),
    (0, tsoa_1.Security)('yyy')
], UsersController.prototype, "authError", null);
__decorate([
    (0, tsoa_1.Get)('{userId}'),
    (0, tsoa_1.Security)('xxx'),
    __param(0, (0, tsoa_1.Path)()),
    __param(1, (0, tsoa_1.Query)())
], UsersController.prototype, "getUser", null);
__decorate([
    (0, tsoa_1.SuccessResponse)('201', 'Created') // Custom success response
    ,
    (0, tsoa_1.Post)(),
    (0, tsoa_1.Security)('xxx'),
    __param(0, (0, tsoa_1.Body)())
], UsersController.prototype, "createUser", null);
__decorate([
    (0, tsoa_1.SuccessResponse)('201', 'Created') // Custom success response
    ,
    (0, tsoa_1.Post)('/error/{anyId}'),
    (0, tsoa_1.Security)('yyyy'),
    __param(0, (0, tsoa_1.Body)())
], UsersController.prototype, "createUsers", null);
exports.UsersController = UsersController = __decorate([
    (0, tsoa_1.Route)('api/users')
], UsersController);
