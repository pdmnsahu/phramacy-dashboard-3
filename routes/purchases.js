const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');

router.get('/', (_req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM purchases ORDER BY created_at DESC').all();
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { medicine_id, batch_number, cost_price, mrp, units_purchased, expiry_date, purchase_date } = req.body;
    if (!medicine_id || !batch_number?.trim() || !cost_price || !mrp || !units_purchased || !expiry_date)
      return res.status(400).json({ success: false, error: 'All fields are required' });

    const med = db.prepare(`
      SELECT m.*, mfr.name AS manufacturer_name
      FROM medicines m JOIN manufacturers mfr ON m.manufacturer_id=mfr.id
      WHERE m.id=?`).get(medicine_id);
    if (!med) return res.status(404).json({ success: false, error: 'Medicine not found' });

    const dupBatch = db.prepare('SELECT id FROM batches WHERE medicine_id=? AND batch_number=?').get(medicine_id, batch_number.trim());
    if (dupBatch) return res.status(400).json({ success: false, error: 'Batch number already exists for this medicine' });

    const pDate = purchase_date || new Date().toISOString().split('T')[0];

    const result = db.transaction(() => {
      const b = db.prepare(
        'INSERT INTO batches (medicine_id,batch_number,cost_price,mrp,units_purchased,units_remaining,expiry_date,purchase_date) VALUES (?,?,?,?,?,?,?,?)'
      ).run(medicine_id, batch_number.trim(), cost_price, mrp, units_purchased, units_purchased, expiry_date, pDate);

      const p = db.prepare(
        'INSERT INTO purchases (medicine_id,batch_id,batch_number,medicine_name,manufacturer_name,cost_price,mrp,units_purchased,expiry_date,purchase_date) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).run(medicine_id, b.lastInsertRowid, batch_number.trim(), med.name, med.manufacturer_name, cost_price, mrp, units_purchased, expiry_date, pDate);

      return db.prepare('SELECT * FROM purchases WHERE id=?').get(p.lastInsertRowid);
    })();

    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const purchase = db.prepare('SELECT * FROM purchases WHERE id=?').get(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, error: 'Purchase not found' });

    const hasSales = db.prepare('SELECT COUNT(*) as c FROM sales WHERE batch_id=?').get(purchase.batch_id).c;
    if (hasSales > 0) return res.status(400).json({ success: false, error: 'Cannot edit — sales are linked to this batch' });

    const { cost_price, mrp, units_purchased, expiry_date, purchase_date } = req.body;
    if (!cost_price || !mrp || !units_purchased || !expiry_date)
      return res.status(400).json({ success: false, error: 'All fields are required' });

    db.transaction(() => {
      db.prepare('UPDATE batches   SET cost_price=?,mrp=?,units_purchased=?,units_remaining=?,expiry_date=?,purchase_date=? WHERE id=?')
        .run(cost_price, mrp, units_purchased, units_purchased, expiry_date, purchase_date||purchase.purchase_date, purchase.batch_id);
      db.prepare('UPDATE purchases SET cost_price=?,mrp=?,units_purchased=?,expiry_date=?,purchase_date=? WHERE id=?')
        .run(cost_price, mrp, units_purchased, expiry_date, purchase_date||purchase.purchase_date, req.params.id);
    })();

    res.json({ success: true, data: db.prepare('SELECT * FROM purchases WHERE id=?').get(req.params.id) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const purchase = db.prepare('SELECT * FROM purchases WHERE id=?').get(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, error: 'Not found' });

    const hasSales = db.prepare('SELECT COUNT(*) as c FROM sales WHERE batch_id=?').get(purchase.batch_id).c;
    if (hasSales > 0) return res.status(400).json({ success: false, error: 'Cannot delete — sales are linked to this batch' });

    db.transaction(() => {
      db.prepare('DELETE FROM batches   WHERE id=?').run(purchase.batch_id);
      db.prepare('DELETE FROM purchases WHERE id=?').run(req.params.id);
    })();

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// All batches (for batch stock page)
router.get('/all-batches', (_req, res) => {
  try {
    const rows = getDb().prepare(`
      SELECT b.*, m.name AS medicine_name, mfr.name AS manufacturer_name
      FROM batches b
      JOIN medicines     m   ON b.medicine_id      = m.id
      JOIN manufacturers mfr ON m.manufacturer_id  = mfr.id
      ORDER BY b.expiry_date ASC
    `).all();
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
