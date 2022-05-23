require('../../../../../..')();
import { app } from './app';

const port = process.env.APP_PORT || 3000;

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));
