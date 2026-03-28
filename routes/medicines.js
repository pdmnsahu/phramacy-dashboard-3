const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');

const withMfr = `
  SELECT m.*, mfr.name AS manufacturer_name
  FROM medicines m
  JOIN manufacturers mfr ON m.manufacturer_id = mfr.id
`;

router.get('/', (_req, res) => {
  try {
    const rows = getDb().prepare(withMfr + ' ORDER BY m.name').all();
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { name, manufacturer_id, category, description } = req.body;
    if (!name?.trim() || !manufacturer_id)
      return res.status(400).json({ success: false, error: 'Name and manufacturer are required' });
    const r   = getDb().prepare('INSERT INTO medicines (name,manufacturer_id,category,description) VALUES (?,?,?,?)').run(name.trim(), manufacturer_id, category||null, description||null);
    const row = getDb().prepare(withMfr + ' WHERE m.id=?').get(r.lastInsertRowid);
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const { name, manufacturer_id, category, description } = req.body;
    if (!name?.trim() || !manufacturer_id)
      return res.status(400).json({ success: false, error: 'Name and manufacturer are required' });
    getDb().prepare('UPDATE medicines SET name=?,manufacturer_id=?,category=?,description=? WHERE id=?').run(name.trim(), manufacturer_id, category||null, description||null, req.params.id);
    const row = getDb().prepare(withMfr + ' WHERE m.id=?').get(req.params.id);
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT COUNT(*) as c FROM purchases WHERE medicine_id=?').get(req.params.id).c;
    const s = db.prepare('SELECT COUNT(*) as c FROM sales     WHERE medicine_id=?').get(req.params.id).c;
    if (p > 0 || s > 0)
      return res.status(400).json({ success: false, error: 'Cannot delete — this medicine has purchase/sale records' });
    db.prepare('DELETE FROM batches  WHERE medicine_id=?').run(req.params.id);
    db.prepare('DELETE FROM medicines WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Batches available for sale (units_remaining > 0, ordered FEFO)
router.get('/:id/batches', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM batches WHERE medicine_id=? AND units_remaining>0 ORDER BY expiry_date ASC').all(req.params.id);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
