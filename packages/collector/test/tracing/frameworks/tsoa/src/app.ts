// app.ts
import express, { Response as ExResponse, Request as ExRequest, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { RegisterRoutes } from '../build/routes';

export const app = express();

// Use body parser to read sent json payloads
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);
app.use(bodyParser.json());

app.use(function errorHandler(err: unknown, req: ExRequest, res: ExResponse, next: NextFunction): ExResponse | void {
  if (err instanceof Error) {
    return res.status(200).json({
      message: 'error damn'
    });
  }

  next();
});

app.use(function anyMiddleware(req: ExRequest, res: ExResponse, next: NextFunction) {
  // NOTE: early exit in a middleware
  if (req.path === '/api/users/error/22') {
    res.sendStatus(200);
    return;
  }

  next();
});

RegisterRoutes(app);

app.get('/', (req, res) => {
  res.sendStatus(200);
});
