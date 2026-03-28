const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');

router.get('/', (_req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM manufacturers ORDER BY name').all();
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { name, contact, address, email } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
    const r   = getDb().prepare('INSERT INTO manufacturers (name,contact,address,email) VALUES (?,?,?,?)').run(name.trim(), contact||null, address||null, email||null);
    const row = getDb().prepare('SELECT * FROM manufacturers WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, data: row });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ success: false, error: 'Manufacturer already exists' });
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, contact, address, email } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
    getDb().prepare('UPDATE manufacturers SET name=?,contact=?,address=?,email=? WHERE id=?').run(name.trim(), contact||null, address||null, email||null, req.params.id);
    const row = getDb().prepare('SELECT * FROM manufacturers WHERE id=?').get(req.params.id);
    res.json({ success: true, data: row });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ success: false, error: 'Name already in use' });
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const linked = getDb().prepare('SELECT COUNT(*) as c FROM medicines WHERE manufacturer_id=?').get(req.params.id).c;
    if (linked > 0) return res.status(400).json({ success: false, error: `Cannot delete — ${linked} medicine(s) linked to this manufacturer` });
    getDb().prepare('DELETE FROM manufacturers WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
