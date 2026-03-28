const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');

router.get('/', (_req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM sales ORDER BY created_at DESC').all();
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { batch_id, units_sold, sale_date } = req.body;
    if (!batch_id || !units_sold) return res.status(400).json({ success: false, error: 'batch_id and units_sold required' });

    const batch = db.prepare('SELECT * FROM batches WHERE id=?').get(batch_id);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    if (batch.units_remaining < units_sold)
      return res.status(400).json({ success: false, error: `Only ${batch.units_remaining} units available in this batch` });

    const med = db.prepare(`
      SELECT m.*, mfr.name AS manufacturer_name
      FROM medicines m JOIN manufacturers mfr ON m.manufacturer_id=mfr.id
      WHERE m.id=?`).get(batch.medicine_id);

    const sDate      = sale_date || new Date().toISOString().split('T')[0];
    const sale_price = batch.mrp        * units_sold;
    const cost_price = batch.cost_price * units_sold;
    const profit     = sale_price - cost_price;

    const result = db.transaction(() => {
      db.prepare('UPDATE batches SET units_remaining=units_remaining-? WHERE id=?').run(units_sold, batch_id);
      const r = db.prepare(
        'INSERT INTO sales (batch_id,medicine_id,batch_number,medicine_name,manufacturer_name,units_sold,sale_price,cost_price,profit,sale_date) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).run(batch_id, batch.medicine_id, batch.batch_number, med.name, med.manufacturer_name, units_sold, sale_price, cost_price, profit, sDate);
      return db.prepare('SELECT * FROM sales WHERE id=?').get(r.lastInsertRowid);
    })();

    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db   = getDb();
    const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

    const { units_sold, sale_date } = req.body;
    if (!units_sold) return res.status(400).json({ success: false, error: 'units_sold required' });

    const batch     = db.prepare('SELECT * FROM batches WHERE id=?').get(sale.batch_id);
    const available = batch.units_remaining + sale.units_sold;
    if (available < units_sold)
      return res.status(400).json({ success: false, error: `Only ${available} units available` });

    const sale_price = batch.mrp        * units_sold;
    const cost_price = batch.cost_price * units_sold;
    const profit     = sale_price - cost_price;
    const sDate      = sale_date || sale.sale_date;

    db.transaction(() => {
      db.prepare('UPDATE batches SET units_remaining=units_remaining+?-? WHERE id=?').run(sale.units_sold, units_sold, sale.batch_id);
      db.prepare('UPDATE sales   SET units_sold=?,sale_price=?,cost_price=?,profit=?,sale_date=? WHERE id=?').run(units_sold, sale_price, cost_price, profit, sDate, req.params.id);
    })();

    res.json({ success: true, data: db.prepare('SELECT * FROM sales WHERE id=?').get(req.params.id) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db   = getDb();
    const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

    db.transaction(() => {
      db.prepare('UPDATE batches SET units_remaining=units_remaining+? WHERE id=?').run(sale.units_sold, sale.batch_id);
      db.prepare('DELETE FROM sales WHERE id=?').run(req.params.id);
    })();

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
