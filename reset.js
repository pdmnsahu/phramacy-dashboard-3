// reset.js — Factory Reset PharmaStore
// Deletes all data and recreates empty tables
// Usage: node reset.js

const Database = require('better-sqlite3');
const path = require('path');
const readline = require('readline');

const DB_PATH = path.join(__dirname, 'database', 'pharmacy.db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('\n⚠️  This will DELETE ALL DATA permanently. Type "yes" to confirm: ', answer => {
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('❌ Reset cancelled.\n');
    process.exit(0);
  }

  try {
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = OFF');

    db.transaction(() => {
      db.prepare('DELETE FROM sales').run();
      db.prepare('DELETE FROM purchases').run();
      db.prepare('DELETE FROM batches').run();
      db.prepare('DELETE FROM medicines').run();
      db.prepare('DELETE FROM manufacturers').run();

      // Reset auto-increment counters
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('sales','purchases','batches','medicines','manufacturers')").run();
    })();

    db.pragma('foreign_keys = ON');
    db.close();

    console.log('\n✅ Factory reset complete — all data cleared.\n');
  } catch (e) {
    console.error('\n❌ Reset failed:', e.message, '\n');
    process.exit(1);
  }
});
