"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require('@instana/collector')();
const app_1 = require("./app");
const port = require('@_instana/collector/test/test_util/app-port')();
app_1.app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));
