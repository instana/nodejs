require('../../../../../..')();
import { app } from './app';

const port = require('../../../../../test_util/app-port')();

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));
