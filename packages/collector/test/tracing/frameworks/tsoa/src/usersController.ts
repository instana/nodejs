import { Body, Controller, Get, Security, Path, Post, Query, Route, SuccessResponse } from 'tsoa';
import { User } from './user';
import { UsersService, UserCreationParams } from './userService';

@Route('api/users')
export class UsersController extends Controller {
  @SuccessResponse('200', 'Created') // Custom success response
  @Get('/auth-error')
  @Security('yyy')
  public async authError(): Promise<void> {
    return;
  }
  @Get('{userId}')
  @Security('xxx')
  public async getUser(@Path() userId: number, @Query() name?: string): Promise<User> {
    return new UsersService().get(userId, name);
  }

  @SuccessResponse('201', 'Created') // Custom success response
  @Post()
  @Security('xxx')
  public async createUser(@Body() requestBody: UserCreationParams): Promise<void> {
    this.setStatus(201); // set return status 201
    new UsersService().create(requestBody);
    return;
  }
  @SuccessResponse('201', 'Created') // Custom success response
  @Post('/error/{anyId}')
  @Security('yyyy')
  public async createUsers(@Body() requestBody: UserCreationParams): Promise<void> {
    this.setStatus(201); // set return status 201
    new UsersService().create(requestBody);
    return;
  }
}
