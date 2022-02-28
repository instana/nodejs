"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require('../../../../../../')();
const app_1 = require("./app");
const port = process.env.APP_PORT || 3000;
app_1.app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));
