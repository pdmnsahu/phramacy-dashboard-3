const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'pharmacy.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS manufacturers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      contact     TEXT,
      address     TEXT,
      email       TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      manufacturer_id INTEGER NOT NULL,
      category        TEXT,
      description     TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
    );

    CREATE TABLE IF NOT EXISTS batches (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id      INTEGER NOT NULL,
      batch_number     TEXT    NOT NULL,
      cost_price       REAL    NOT NULL,
      mrp              REAL    NOT NULL,
      units_purchased  INTEGER NOT NULL,
      units_remaining  INTEGER NOT NULL,
      expiry_date      DATE    NOT NULL,
      purchase_date    DATE    NOT NULL DEFAULT (date('now')),
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      UNIQUE(medicine_id, batch_number)
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id       INTEGER NOT NULL,
      batch_id          INTEGER NOT NULL,
      batch_number      TEXT    NOT NULL,
      medicine_name     TEXT    NOT NULL,
      manufacturer_name TEXT    NOT NULL,
      cost_price        REAL    NOT NULL,
      mrp               REAL    NOT NULL,
      units_purchased   INTEGER NOT NULL,
      expiry_date       DATE    NOT NULL,
      purchase_date     DATE    NOT NULL DEFAULT (date('now')),
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id),
      FOREIGN KEY (batch_id)    REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id          INTEGER NOT NULL,
      medicine_id       INTEGER NOT NULL,
      batch_number      TEXT    NOT NULL,
      medicine_name     TEXT    NOT NULL,
      manufacturer_name TEXT    NOT NULL,
      units_sold        INTEGER NOT NULL,
      sale_price        REAL    NOT NULL,
      cost_price        REAL    NOT NULL,
      profit            REAL    NOT NULL,
      sale_date         DATE    NOT NULL DEFAULT (date('now')),
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id)   REFERENCES batches(id),
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);
  console.log('✅ Database ready');
  return db;
}

module.exports = { getDb, initializeDatabase };
