const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('ok'));
app.listen(5001, () => console.log('Listening on 5001'));
