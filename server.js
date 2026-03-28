const express = require('express');
const path    = require('path');
const { initializeDatabase } = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

initializeDatabase();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/manufacturers', require('./routes/manufacturers'));
app.use('/api/medicines',     require('./routes/medicines'));
app.use('/api/purchases',     require('./routes/purchases'));
app.use('/api/sales',         require('./routes/sales'));
app.use('/api/dashboard',     require('./routes/dashboard'));

app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () =>
  console.log(`\n💊  PharmaStore → http://localhost:${PORT}\n`)
);
