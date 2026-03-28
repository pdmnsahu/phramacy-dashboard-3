// ============================================================
//  PHARMASTORE  — app.js
// ============================================================

// ── STATE ─────────────────────────────────────────────────────────────────────
let manufacturers = [];
let medicines     = [];
let purchases     = [];
let sales         = [];
let batches       = [];
let confirmCb     = null;
let currentBatch  = null; // selected batch object for sale modal
let revenueChartInst = null;
let profitChartInst  = null;

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('topbarDate').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('pur-date').value  = today();
  document.getElementById('sale-date').value = today();

  await Promise.all([loadManufacturers(), loadMedicines()]);
  loadDashboard();
});

function today() { return new Date().toISOString().split('T')[0]; }

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = {
    dashboard:'Dashboard', manufacturers:'Manufacturers', medicines:'Medicines',
    purchases:'Purchases', sales:'Sales', batches:'Batch Stock'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  if (page === 'dashboard')     loadDashboard();
  if (page === 'manufacturers') loadManufacturers().then(renderManufacturers);
  if (page === 'medicines')     loadMedicines().then(renderMedicines);
  if (page === 'purchases')     loadPurchases().then(renderPurchases);
  if (page === 'sales')         loadSales().then(renderSales);
  if (page === 'batches')       loadBatches().then(renderBatches);
}

// ── API HELPERS ───────────────────────────────────────────────────────────────
async function api(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    return await res.json();
  } catch (e) {
    console.error('API error:', e);
    return { success: false, error: e.message };
  }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'success') {
  const el   = document.getElementById('toastEl');
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  document.getElementById('toastIcon').textContent = icons[type] || '✅';
  document.getElementById('toastMsg').textContent  = msg;
  el.className = `alert alert-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ── CONFIRM DIALOG ────────────────────────────────────────────────────────────
function confirm(msg, onOk, btnLabel = 'Delete') {
  document.getElementById('confirm-msg').innerHTML = msg;
  document.getElementById('confirm-ok-btn').textContent = btnLabel;
  confirmCb = onOk;
  openModal('confirm-modal');
}
function execConfirm() {
  closeModal('confirm-modal');
  if (confirmCb) confirmCb();
  confirmCb = null;
}

// ── FORMATTING ────────────────────────────────────────────────────────────────
const fmt     = n => '₹' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN') : '—';

function expiryBadge(expiry) {
  if (!expiry) return '<span class="badge badge-muted">—</span>';
  const d    = new Date(expiry + 'T00:00:00');
  const now  = new Date(); now.setHours(0,0,0,0);
  const days = Math.ceil((d - now) / 864e5);
  if (days < 0)   return `<span class="badge badge-danger">Expired</span>`;
  if (days <= 30) return `<span class="badge badge-warning">Expires in ${days}d</span>`;
  return `<span class="badge badge-success">${fmtDate(expiry)}</span>`;
}

function batchStatusBadge(b) {
  const now  = new Date(); now.setHours(0,0,0,0);
  const exp  = new Date(b.expiry_date + 'T00:00:00');
  const days = Math.ceil((exp - now) / 864e5);
  if (b.units_remaining === 0) return '<span class="badge badge-muted">Out of Stock</span>';
  if (days < 0)    return '<span class="badge badge-danger">Expired</span>';
  if (days <= 30)  return '<span class="badge badge-warning">Near Expiry</span>';
  return '<span class="badge badge-success">In Stock</span>';
}

// ── CHARTS (canvas) ───────────────────────────────────────────────────────────
class LineChart {
  constructor(canvas, labels, data, color) {
    this.canvas = canvas; this.labels = labels; this.data = data; this.color = color;
    this.draw();
    this._ro = new ResizeObserver(() => this.draw());
    this._ro.observe(canvas.parentElement);
  }
  destroy() { this._ro?.disconnect(); }
  draw() {
    const { canvas, labels, data, color } = this;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width || 400, H = 220;
    canvas.width  = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = { top:20, right:20, bottom:50, left:70 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top  - pad.bottom;
    ctx.clearRect(0, 0, W, H);

    if (!data.length) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '13px Sora,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No data yet', W / 2, H / 2); return;
    }

    const max = Math.max(...data, 0), range = max || 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px JetBrains Mono,monospace'; ctx.textAlign = 'right';
      ctx.fillText('₹' + (max - (range / 4) * i).toLocaleString('en-IN', { maximumFractionDigits:0 }), pad.left - 6, y + 4);
    }

    const step = Math.max(1, Math.ceil(labels.length / 7));
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px Sora,sans-serif'; ctx.textAlign = 'center';
    labels.forEach((lbl, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      const x = pad.left + (i / Math.max(data.length - 1, 1)) * cW;
      ctx.fillText(lbl, x, H - pad.bottom + 18);
    });

    const pts = data.map((v, i) => ({
      x: pad.left + (i / Math.max(data.length - 1, 1)) * cW,
      y: pad.top  + (1 - v / range) * cH
    }));

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, color + '28'); grad.addColorStop(1, color + '05');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.top + cH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.top + cH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    });
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const r = await api('/api/dashboard');
  if (!r.success) return;
  const d = r.data;

  document.getElementById('d-medicines').textContent    = d.totalMedicines;
  document.getElementById('d-mfrs').textContent         = d.totalManufacturers;
  document.getElementById('d-stock').textContent        = d.totalStock.toLocaleString();
  document.getElementById('d-near').textContent         = d.nearExpiry;
  document.getElementById('d-expired').textContent      = d.expired;
  document.getElementById('d-out').textContent          = d.outOfStock;

  document.getElementById('d-today-rev').textContent    = fmt(d.todaySales.revenue);
  document.getElementById('d-today-count').textContent  = `${d.todaySales.count} sale${d.todaySales.count !== 1 ? 's' : ''}`;
  document.getElementById('d-today-profit').textContent = fmt(d.todaySales.profit);
  document.getElementById('d-week-rev').textContent     = fmt(d.weekSales.revenue);
  document.getElementById('d-week-profit').textContent  = fmt(d.weekSales.profit);
  document.getElementById('d-month-rev').textContent    = fmt(d.monthSales.revenue);
  document.getElementById('d-month-profit').textContent = fmt(d.monthSales.profit);

  // Charts
  const labels  = d.trend.map(t => new Date(t.sale_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short' }));
  const revenues = d.trend.map(t => parseFloat(t.revenue) || 0);
  const profits  = d.trend.map(t => parseFloat(t.profit)  || 0);

  revenueChartInst?.destroy();
  profitChartInst?.destroy();
  revenueChartInst = new LineChart(document.getElementById('revenueChart'), labels, revenues, '#0d9488');
  profitChartInst  = new LineChart(document.getElementById('profitChart'),  labels, profits,  '#059669');

  // Top medicines
  document.getElementById('d-top-meds').innerHTML = d.topMeds.length === 0
    ? `<tr><td colspan="4" class="empty-state"><div class="empty-icon">💊</div>No sales yet</td></tr>`
    : d.topMeds.map((m, i) => `<tr>
        <td><strong>${i + 1}</strong></td>
        <td>${m.medicine_name}</td>
        <td>${m.total_sold.toLocaleString()}</td>
        <td class="text-right font-mono">${fmt(m.revenue)}</td>
      </tr>`).join('');

  // Recent sales
  document.getElementById('d-recent-sales').innerHTML = d.recentSales.length === 0
    ? `<tr><td colspan="4" class="empty-state">No sales yet</td></tr>`
    : d.recentSales.map(s => `<tr>
        <td>${s.medicine_name}</td>
        <td><code class="batch-code">${s.batch_number}</code></td>
        <td>${s.units_sold}</td>
        <td class="text-right font-mono">${fmt(s.sale_price)}</td>
      </tr>`).join('');
}

// ── MANUFACTURERS ─────────────────────────────────────────────────────────────
async function loadManufacturers() {
  const r = await api('/api/manufacturers');
  if (r.success) manufacturers = r.data;
  populateMfrSelects();
  return manufacturers;
}

function populateMfrSelects() {
  document.querySelectorAll('.mfr-select').forEach(sel => {
    const val = sel.value;
    sel.innerHTML = '<option value="">Select manufacturer…</option>' +
      manufacturers.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    if (val) sel.value = val;
  });
}

function renderManufacturers() {
  const q = (document.getElementById('mfr-search')?.value || '').toLowerCase();
  const list = manufacturers.filter(m =>
    m.name.toLowerCase().includes(q) ||
    (m.contact || '').toLowerCase().includes(q) ||
    (m.email   || '').toLowerCase().includes(q)
  );
  document.getElementById('mfr-count').textContent = list.length;
  document.getElementById('mfr-table').innerHTML = list.length === 0
    ? `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🏭</div>No manufacturers yet</td></tr>`
    : list.map((m, i) => `<tr>
        <td class="text-muted">${i + 1}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.contact || '<span class="text-muted">—</span>'}</td>
        <td>${m.email   || '<span class="text-muted">—</span>'}</td>
        <td>${m.address || '<span class="text-muted">—</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editMfr(${m.id})">✏️ Edit</button>
          <button class="btn btn-sm btn-danger"  onclick="deleteMfr(${m.id},'${esc(m.name)}')">🗑</button>
        </td>
      </tr>`).join('');
}

function openMfrModal(id) {
  document.getElementById('mfr-id').value      = '';
  document.getElementById('mfr-name').value    = '';
  document.getElementById('mfr-contact').value = '';
  document.getElementById('mfr-email').value   = '';
  document.getElementById('mfr-address').value = '';
  document.getElementById('mfr-modal-title').textContent = 'Add Manufacturer';
  openModal('mfr-modal');
  if (id) editMfr(id);
}

function editMfr(id) {
  const m = manufacturers.find(x => x.id === id);
  if (!m) return;
  document.getElementById('mfr-id').value      = m.id;
  document.getElementById('mfr-name').value    = m.name;
  document.getElementById('mfr-contact').value = m.contact || '';
  document.getElementById('mfr-email').value   = m.email   || '';
  document.getElementById('mfr-address').value = m.address || '';
  document.getElementById('mfr-modal-title').textContent = 'Edit Manufacturer';
  openModal('mfr-modal');
}

async function saveMfr() {
  const id      = document.getElementById('mfr-id').value;
  const payload = {
    name:    document.getElementById('mfr-name').value.trim(),
    contact: document.getElementById('mfr-contact').value.trim(),
    email:   document.getElementById('mfr-email').value.trim(),
    address: document.getElementById('mfr-address').value.trim()
  };
  if (!payload.name) { toast('Name is required', 'error'); return; }

  const r = id
    ? await api(`/api/manufacturers/${id}`, { method:'PUT',  body: JSON.stringify(payload) })
    : await api('/api/manufacturers',        { method:'POST', body: JSON.stringify(payload) });

  if (!r.success) { toast(r.error, 'error'); return; }
  toast(id ? 'Manufacturer updated' : 'Manufacturer added');
  closeModal('mfr-modal');
  await loadManufacturers();
  renderManufacturers();
  refreshDashboard();
}

async function deleteMfr(id, name) {
  confirm(`Delete manufacturer <strong>${name}</strong>?<br><small>This will fail if medicines are linked.</small>`, async () => {
    const r = await api(`/api/manufacturers/${id}`, { method:'DELETE' });
    if (!r.success) { toast(r.error, 'error'); return; }
    toast('Manufacturer deleted');
    await loadManufacturers();
    renderManufacturers();
    refreshDashboard();
  });
}

// ── MEDICINES ─────────────────────────────────────────────────────────────────
async function loadMedicines() {
  const r = await api('/api/medicines');
  if (r.success) medicines = r.data;
  populateMedSelects();
  return medicines;
}

function populateMedSelects() {
  document.querySelectorAll('.med-select').forEach(sel => {
    const val = sel.value;
    sel.innerHTML = '<option value="">Select medicine…</option>' +
      medicines.map(m => `<option value="${m.id}">${m.name} — ${m.manufacturer_name}</option>`).join('');
    if (val) sel.value = val;
  });
}

function renderMedicines() {
  const q = (document.getElementById('med-search')?.value || '').toLowerCase();
  const list = medicines.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.manufacturer_name.toLowerCase().includes(q) ||
    (m.category || '').toLowerCase().includes(q)
  );
  document.getElementById('med-count').textContent = list.length;
  document.getElementById('med-table').innerHTML = list.length === 0
    ? `<tr><td colspan="6" class="empty-state"><div class="empty-icon">💉</div>No medicines yet</td></tr>`
    : list.map((m, i) => `<tr>
        <td class="text-muted">${i + 1}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.manufacturer_name}</td>
        <td>${m.category ? `<span class="badge badge-teal">${m.category}</span>` : '<span class="text-muted">—</span>'}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.description || '<span class="text-muted">—</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editMed(${m.id})">✏️ Edit</button>
          <button class="btn btn-sm btn-danger"  onclick="deleteMed(${m.id},'${esc(m.name)}')">🗑</button>
        </td>
      </tr>`).join('');
}

function openMedModal() {
  document.getElementById('med-id').value           = '';
  document.getElementById('med-name').value         = '';
  document.getElementById('med-category').value     = '';
  document.getElementById('med-desc').value         = '';
  document.getElementById('med-modal-title').textContent = 'Add Medicine';
  // populate manufacturer select
  const sel = document.getElementById('med-manufacturer');
  sel.innerHTML = '<option value="">Select manufacturer…</option>' +
    manufacturers.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  openModal('med-modal');
}

function editMed(id) {
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  openMedModal();
  document.getElementById('med-id').value               = m.id;
  document.getElementById('med-name').value             = m.name;
  document.getElementById('med-manufacturer').value     = m.manufacturer_id;
  document.getElementById('med-category').value         = m.category || '';
  document.getElementById('med-desc').value             = m.description || '';
  document.getElementById('med-modal-title').textContent = 'Edit Medicine';
}

async function saveMed() {
  const id = document.getElementById('med-id').value;
  const payload = {
    name:            document.getElementById('med-name').value.trim(),
    manufacturer_id: document.getElementById('med-manufacturer').value,
    category:        document.getElementById('med-category').value.trim(),
    description:     document.getElementById('med-desc').value.trim()
  };
  if (!payload.name || !payload.manufacturer_id) { toast('Name and manufacturer are required', 'error'); return; }

  const r = id
    ? await api(`/api/medicines/${id}`, { method:'PUT',  body: JSON.stringify(payload) })
    : await api('/api/medicines',        { method:'POST', body: JSON.stringify(payload) });

  if (!r.success) { toast(r.error, 'error'); return; }
  toast(id ? 'Medicine updated' : 'Medicine added');
  closeModal('med-modal');
  await loadMedicines();
  renderMedicines();
  refreshDashboard();
}

async function deleteMed(id, name) {
  confirm(`Delete medicine <strong>${name}</strong>?<br><small>Will fail if purchase/sale records exist.</small>`, async () => {
    const r = await api(`/api/medicines/${id}`, { method:'DELETE' });
    if (!r.success) { toast(r.error, 'error'); return; }
    toast('Medicine deleted');
    await loadMedicines();
    renderMedicines();
    refreshDashboard();
  });
}

// ── PURCHASES ─────────────────────────────────────────────────────────────────
async function loadPurchases() {
  const r = await api('/api/purchases');
  if (r.success) purchases = r.data;
  return purchases;
}

function renderPurchases() {
  const q = (document.getElementById('pur-search')?.value || '').toLowerCase();
  const list = purchases.filter(p =>
    p.medicine_name.toLowerCase().includes(q) ||
    p.manufacturer_name.toLowerCase().includes(q) ||
    p.batch_number.toLowerCase().includes(q)
  );
  document.getElementById('pur-count').textContent = list.length;
  const totalInvested = list.reduce((s, p) => s + p.cost_price * p.units_purchased, 0);
  document.getElementById('pur-total-val').textContent = fmt(totalInvested);

  document.getElementById('pur-table').innerHTML = list.length === 0
    ? `<tr><td colspan="11" class="empty-state"><div class="empty-icon">🛒</div>No purchases yet</td></tr>`
    : list.map((p, i) => `<tr>
        <td class="text-muted">${i + 1}</td>
        <td><strong>${p.medicine_name}</strong></td>
        <td>${p.manufacturer_name}</td>
        <td><code class="batch-code">${p.batch_number}</code></td>
        <td>${p.units_purchased}</td>
        <td class="font-mono">${fmt(p.cost_price)}</td>
        <td class="font-mono">${fmt(p.mrp)}</td>
        <td class="font-mono">${fmt(p.cost_price * p.units_purchased)}</td>
        <td>${expiryBadge(p.expiry_date)}</td>
        <td>${fmtDate(p.purchase_date)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editPurchase(${p.id})">✏️ Edit</button>
          <button class="btn btn-sm btn-danger"  onclick="deletePurchase(${p.id},'${esc(p.medicine_name)}','${esc(p.batch_number)}')">🗑</button>
        </td>
      </tr>`).join('');
}

function openPurchaseModal() {
  document.getElementById('pur-id').value     = '';
  document.getElementById('pur-batch').value  = '';
  document.getElementById('pur-expiry').value = '';
  document.getElementById('pur-date').value   = today();
  document.getElementById('pur-units').value  = '';
  document.getElementById('pur-cost').value   = '';
  document.getElementById('pur-mrp').value    = '';
  document.getElementById('pur-total').value  = '';
  document.getElementById('pur-modal-title').textContent = 'Record Purchase';

  const sel = document.getElementById('pur-medicine');
  sel.innerHTML = '<option value="">Select medicine…</option>' +
    medicines.map(m => `<option value="${m.id}">${m.name} — ${m.manufacturer_name}</option>`).join('');
  sel.value = '';
  // Lock medicine in edit mode
  sel.disabled = false;
  openModal('pur-modal');
}

function editPurchase(id) {
  const p = purchases.find(x => x.id === id);
  if (!p) return;
  openPurchaseModal();
  document.getElementById('pur-id').value     = p.id;
  document.getElementById('pur-medicine').value = p.medicine_id;
  document.getElementById('pur-medicine').disabled = true; // can't change medicine
  document.getElementById('pur-batch').value  = p.batch_number;
  document.getElementById('pur-batch').readOnly = true;
  document.getElementById('pur-expiry').value = p.expiry_date;
  document.getElementById('pur-date').value   = p.purchase_date;
  document.getElementById('pur-units').value  = p.units_purchased;
  document.getElementById('pur-cost').value   = p.cost_price;
  document.getElementById('pur-mrp').value    = p.mrp;
  calcPurchaseTotal();
  document.getElementById('pur-modal-title').textContent = 'Edit Purchase';
}

function calcPurchaseTotal() {
  const u = parseFloat(document.getElementById('pur-units')?.value) || 0;
  const c = parseFloat(document.getElementById('pur-cost')?.value)  || 0;
  document.getElementById('pur-total').value = u && c ? fmt(u * c) : '';
}

async function savePurchase() {
  const id = document.getElementById('pur-id').value;
  const payload = {
    medicine_id:     document.getElementById('pur-medicine').value,
    batch_number:    document.getElementById('pur-batch').value.trim(),
    expiry_date:     document.getElementById('pur-expiry').value,
    purchase_date:   document.getElementById('pur-date').value,
    units_purchased: parseInt(document.getElementById('pur-units').value),
    cost_price:      parseFloat(document.getElementById('pur-cost').value),
    mrp:             parseFloat(document.getElementById('pur-mrp').value)
  };

  if (!payload.medicine_id || !payload.batch_number || !payload.expiry_date ||
      !payload.units_purchased || !payload.cost_price || !payload.mrp) {
    toast('Please fill all required fields', 'error'); return;
  }

  const r = id
    ? await api(`/api/purchases/${id}`, { method:'PUT',  body: JSON.stringify(payload) })
    : await api('/api/purchases',        { method:'POST', body: JSON.stringify(payload) });

  if (!r.success) { toast(r.error, 'error'); return; }

  // Re-enable medicine select in case it was disabled
  document.getElementById('pur-medicine').disabled = false;
  document.getElementById('pur-batch').readOnly = false;

  toast(id ? 'Purchase updated' : 'Purchase recorded');
  closeModal('pur-modal');
  await loadPurchases();
  renderPurchases();
  await loadBatches();
  refreshDashboard();
}

async function deletePurchase(id, medName, batch) {
  confirm(`Delete purchase of <strong>${medName}</strong> (batch <strong>${batch}</strong>)?<br><small>Will fail if sales are linked to this batch.</small>`, async () => {
    const r = await api(`/api/purchases/${id}`, { method:'DELETE' });
    if (!r.success) { toast(r.error, 'error'); return; }
    toast('Purchase deleted');
    await loadPurchases();
    renderPurchases();
    await loadBatches();
    refreshDashboard();
  });
}

// ── SALES ─────────────────────────────────────────────────────────────────────
async function loadSales() {
  const r = await api('/api/sales');
  if (r.success) sales = r.data;
  return sales;
}

function renderSales() {
  const q = (document.getElementById('sale-search')?.value || '').toLowerCase();
  const list = sales.filter(s =>
    s.medicine_name.toLowerCase().includes(q) ||
    s.manufacturer_name.toLowerCase().includes(q) ||
    s.batch_number.toLowerCase().includes(q)
  );
  document.getElementById('sale-count').textContent = list.length;
  const totalRevenue = list.reduce((s, x) => s + x.sale_price, 0);
  const totalProfit  = list.reduce((s, x) => s + x.profit,     0);
  document.getElementById('sale-total-val').textContent  = fmt(totalRevenue);
  document.getElementById('sale-profit-val').textContent = fmt(totalProfit);

  document.getElementById('sale-table').innerHTML = list.length === 0
    ? `<tr><td colspan="10" class="empty-state"><div class="empty-icon">💰</div>No sales yet</td></tr>`
    : list.map((s, i) => `<tr>
        <td class="text-muted">${i + 1}</td>
        <td><strong>${s.medicine_name}</strong></td>
        <td>${s.manufacturer_name}</td>
        <td><code class="batch-code">${s.batch_number}</code></td>
        <td>${s.units_sold}</td>
        <td class="font-mono">${fmt(s.sale_price)}</td>
        <td class="font-mono text-muted">${fmt(s.cost_price)}</td>
        <td class="font-mono text-success">${fmt(s.profit)}</td>
        <td>${fmtDate(s.sale_date)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editSale(${s.id})">✏️ Edit</button>
          <button class="btn btn-sm btn-danger"  onclick="deleteSale(${s.id},'${esc(s.medicine_name)}','${esc(s.batch_number)}')">🗑</button>
        </td>
      </tr>`).join('');
}

async function openSaleModal() {
  document.getElementById('sale-id').value        = '';
  document.getElementById('sale-units').value     = '';
  document.getElementById('sale-date').value      = today();
  document.getElementById('sale-revenue').value   = '';
  document.getElementById('sale-profit-calc').value = '';
  document.getElementById('sale-modal-title').textContent = 'Record Sale';
  document.getElementById('sale-batch-info').classList.remove('show');
  currentBatch = null;

  // Populate medicine select
  const medSel = document.getElementById('sale-medicine');
  medSel.innerHTML = '<option value="">Select medicine…</option>' +
    medicines.map(m => `<option value="${m.id}">${m.name} — ${m.manufacturer_name}</option>`).join('');
  medSel.value = '';
  medSel.disabled = false;

  document.getElementById('sale-batch').innerHTML = '<option value="">Select medicine first…</option>';
  document.getElementById('sale-batch').disabled  = true;

  openModal('sale-modal');
}

async function editSale(id) {
  const s = sales.find(x => x.id === id);
  if (!s) return;
  await openSaleModal();

  document.getElementById('sale-id').value    = s.id;
  document.getElementById('sale-date').value  = s.sale_date;
  document.getElementById('sale-modal-title').textContent = 'Edit Sale';

  // Set medicine and load its batches
  document.getElementById('sale-medicine').value    = s.medicine_id;
  document.getElementById('sale-medicine').disabled = true;
  await onSaleMedicineChange(s.batch_id);
  document.getElementById('sale-batch').value    = s.batch_id;
  document.getElementById('sale-batch').disabled = true;
  onSaleBatchChange();
  document.getElementById('sale-units').value = s.units_sold;
  calcSaleTotal();
}

async function onSaleMedicineChange(preselectBatchId = null) {
  const medId = document.getElementById('sale-medicine').value;
  const bSel  = document.getElementById('sale-batch');
  currentBatch = null;
  document.getElementById('sale-batch-info').classList.remove('show');
  document.getElementById('sale-revenue').value     = '';
  document.getElementById('sale-profit-calc').value = '';

  if (!medId) {
    bSel.innerHTML = '<option value="">Select medicine first…</option>';
    bSel.disabled  = true;
    return;
  }

  const r = await api(`/api/medicines/${medId}/batches`);
  if (!r.success || !r.data.length) {
    bSel.innerHTML = '<option value="">No stock available</option>';
    bSel.disabled  = true;
    toast('No batches with available stock for this medicine', 'warning');
    return;
  }

  bSel.disabled = false;
  // sorted FEFO (API already returns expiry ASC)
  bSel.innerHTML = r.data.map((b, i) => {
    const label = `${b.batch_number}  |  Exp: ${fmtDate(b.expiry_date)}  |  ${b.units_remaining} units  |  MRP: ${fmt(b.mrp)}`;
    return `<option value="${b.id}" data-json='${JSON.stringify(b)}'>${label}${i === 0 ? ' ★ (earliest expiry)' : ''}</option>`;
  }).join('');

  if (preselectBatchId) {
    bSel.value = preselectBatchId;
  }
  // Default = first (earliest expiry)
  onSaleBatchChange();
}

function onSaleBatchChange() {
  const bSel = document.getElementById('sale-batch');
  const opt  = bSel.selectedOptions[0];
  document.getElementById('sale-batch-info').classList.remove('show');
  currentBatch = null;
  document.getElementById('sale-revenue').value     = '';
  document.getElementById('sale-profit-calc').value = '';

  if (!opt || !opt.dataset.json) return;
  try {
    currentBatch = JSON.parse(opt.dataset.json);
    document.getElementById('bi-batch').textContent  = currentBatch.batch_number;
    document.getElementById('bi-avail').textContent  = currentBatch.units_remaining;
    document.getElementById('bi-mrp').textContent    = fmt(currentBatch.mrp);
    document.getElementById('bi-expiry').textContent = fmtDate(currentBatch.expiry_date);
    document.getElementById('sale-batch-info').classList.add('show');
    calcSaleTotal();
  } catch (e) { /* ignore */ }
}

function calcSaleTotal() {
  if (!currentBatch) return;
  const units = parseInt(document.getElementById('sale-units').value) || 0;
  const rev   = currentBatch.mrp        * units;
  const cost  = currentBatch.cost_price * units;
  document.getElementById('sale-revenue').value     = units ? fmt(rev)        : '';
  document.getElementById('sale-profit-calc').value = units ? fmt(rev - cost) : '';
}

async function saveSale() {
  const id = document.getElementById('sale-id').value;
  const payload = {
    batch_id:   parseInt(document.getElementById('sale-batch').value),
    units_sold: parseInt(document.getElementById('sale-units').value),
    sale_date:  document.getElementById('sale-date').value
  };

  if (!payload.batch_id || !payload.units_sold || !payload.sale_date) {
    toast('Please fill all required fields', 'error'); return;
  }

  const r = id
    ? await api(`/api/sales/${id}`, { method:'PUT',  body: JSON.stringify(payload) })
    : await api('/api/sales',        { method:'POST', body: JSON.stringify(payload) });

  if (!r.success) { toast(r.error, 'error'); return; }

  document.getElementById('sale-medicine').disabled = false;
  document.getElementById('sale-batch').disabled    = false;

  toast(id ? 'Sale updated' : 'Sale recorded');
  closeModal('sale-modal');
  await loadSales();
  renderSales();
  await loadBatches();
  refreshDashboard();
}

async function deleteSale(id, medName, batch) {
  confirm(`Delete sale of <strong>${medName}</strong> (batch <strong>${batch}</strong>)?<br><small>Stock will be restored to the batch.</small>`, async () => {
    const r = await api(`/api/sales/${id}`, { method:'DELETE' });
    if (!r.success) { toast(r.error, 'error'); return; }
    toast('Sale deleted — stock restored');
    await loadSales();
    renderSales();
    await loadBatches();
    refreshDashboard();
  });
}

// ── BATCH STOCK ───────────────────────────────────────────────────────────────
async function loadBatches() {
  const r = await api('/api/purchases/all-batches');
  if (r.success) batches = r.data;
  return batches;
}

function renderBatches() {
  const q      = (document.getElementById('batch-search')?.value || '').toLowerCase();
  const filter = document.getElementById('batch-filter')?.value || 'all';
  const now    = new Date(); now.setHours(0,0,0,0);

  let list = batches.filter(b => {
    const match = b.medicine_name.toLowerCase().includes(q) ||
                  b.manufacturer_name.toLowerCase().includes(q) ||
                  b.batch_number.toLowerCase().includes(q);
    if (!match) return false;
    const exp  = new Date(b.expiry_date + 'T00:00:00');
    const days = Math.ceil((exp - now) / 864e5);
    if (filter === 'active')  return b.units_remaining > 0 && days >= 0;
    if (filter === 'expired') return b.units_remaining > 0 && days < 0;
    if (filter === 'near')    return b.units_remaining > 0 && days >= 0 && days <= 30;
    if (filter === 'out')     return b.units_remaining === 0;
    return true;
  });

  document.getElementById('batch-count').textContent = list.length;
  const stockVal = list.reduce((s, b) => s + b.cost_price * b.units_remaining, 0);
  document.getElementById('batch-val').textContent = fmt(stockVal);

  document.getElementById('batch-table').innerHTML = list.length === 0
    ? `<tr><td colspan="11" class="empty-state"><div class="empty-icon">📦</div>No batches found</td></tr>`
    : list.map((b, i) => `<tr>
        <td class="text-muted">${i + 1}</td>
        <td><strong>${b.medicine_name}</strong></td>
        <td>${b.manufacturer_name}</td>
        <td><code class="batch-code">${b.batch_number}</code></td>
        <td>${b.units_purchased}</td>
        <td><strong>${b.units_remaining}</strong></td>
        <td class="text-muted">${b.units_purchased - b.units_remaining}</td>
        <td class="font-mono">${fmt(b.cost_price)}</td>
        <td class="font-mono">${fmt(b.mrp)}</td>
        <td>${expiryBadge(b.expiry_date)}</td>
        <td>${batchStatusBadge(b)}</td>
      </tr>`).join('');
}

// ── REFRESH HELPERS ───────────────────────────────────────────────────────────
function refreshDashboard() {
  // Only refresh dashboard stats if it's currently active
  if (document.getElementById('page-dashboard').classList.contains('active')) {
    loadDashboard();
  } else {
    // Always keep dashboard data fresh silently
    loadDashboard();
  }
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
