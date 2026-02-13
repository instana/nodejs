require('@instana/collector')();
import { app } from './app';

const port = require('@_local/collector/test/test_util/app-port')();

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));
