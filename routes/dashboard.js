const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');

router.get('/', (_req, res) => {
  try {
    const db     = getDb();
    const today  = new Date().toISOString().split('T')[0];
    const in30   = new Date(Date.now() + 30*864e5).toISOString().split('T')[0];
    const wStart = new Date(Date.now() -  6*864e5).toISOString().split('T')[0];
    const mStart = today.slice(0, 7) + '-01';

    const totalMedicines     = db.prepare('SELECT COUNT(*) AS c FROM medicines').get().c;
    const totalManufacturers = db.prepare('SELECT COUNT(*) AS c FROM manufacturers').get().c;
    const totalStock         = db.prepare('SELECT COALESCE(SUM(units_remaining),0) AS c FROM batches').get().c;
    const nearExpiry         = db.prepare("SELECT COUNT(*) AS c FROM batches WHERE expiry_date BETWEEN ? AND ? AND units_remaining>0").get(today, in30).c;
    const expired            = db.prepare("SELECT COUNT(*) AS c FROM batches WHERE expiry_date < ? AND units_remaining>0").get(today).c;
    const outOfStock         = db.prepare('SELECT COUNT(*) AS c FROM batches WHERE units_remaining=0').get().c;

    const todaySales = db.prepare("SELECT COALESCE(SUM(sale_price),0) AS revenue, COALESCE(SUM(profit),0) AS profit, COUNT(*) AS count FROM sales WHERE sale_date=?").get(today);
    const weekSales  = db.prepare("SELECT COALESCE(SUM(sale_price),0) AS revenue, COALESCE(SUM(profit),0) AS profit FROM sales WHERE sale_date>=?").get(wStart);
    const monthSales = db.prepare("SELECT COALESCE(SUM(sale_price),0) AS revenue, COALESCE(SUM(profit),0) AS profit FROM sales WHERE sale_date>=?").get(mStart);

    const totalPurchaseCost = db.prepare('SELECT COALESCE(SUM(cost_price*units_purchased),0) AS c FROM purchases').get().c;
    const totalSaleRevenue  = db.prepare('SELECT COALESCE(SUM(sale_price),0) AS c FROM sales').get().c;

    const trend = db.prepare(`
      SELECT sale_date, SUM(sale_price) AS revenue, SUM(profit) AS profit
      FROM sales WHERE sale_date>=? GROUP BY sale_date ORDER BY sale_date ASC
    `).all(wStart);

    const topMeds = db.prepare(`
      SELECT medicine_name, SUM(units_sold) AS total_sold, SUM(sale_price) AS revenue
      FROM sales GROUP BY medicine_id ORDER BY total_sold DESC LIMIT 5
    `).all();

    const recentSales = db.prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT 8').all();

    res.json({ success: true, data: {
      totalMedicines, totalManufacturers, totalStock,
      nearExpiry, expired, outOfStock,
      todaySales, weekSales, monthSales,
      totalPurchaseCost, totalSaleRevenue,
      trend, topMeds, recentSales
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
