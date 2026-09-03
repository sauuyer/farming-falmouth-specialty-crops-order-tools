/**
 * Farming Falmouth Speciality Crops — order backend.
 *
 * GitHub Pages is static hosting: it can serve the form but cannot store an
 * order or count down remaining units. This script is the piece that can.
 * It lives on the farm's own Google Sheet and answers JSON over HTTPS.
 *
 * Every request is a POST with Content-Type text/plain. That is deliberate —
 * it keeps the browser from sending a CORS preflight, which Apps Script does
 * not answer. Do not "fix" it to application/json.
 */

const CATALOG = 'Catalog';
const ORDERS  = 'Orders';
const CONFIG  = 'Config';

function ss_() { return SpreadsheetApp.getActive(); }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet()  { return json_(ok_(publicWeek_())); }
function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Malformed request body.' }); }
  try { return json_(ok_(route_(req))); }
  catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}
function ok_(data) { return { ok: true, data: data }; }

function route_(req) {
  switch (req.action) {
    case 'week':       return publicWeek_();
    case 'order':      return placeOrder_(req.order);
    case 'admin':      requireKey_(req.key); return adminData_();
    case 'saveCrop':   requireKey_(req.key); return saveCrop_(req.id, req.patch);
    case 'addCrop':    requireKey_(req.key); return addCrop_(req.crop);
    case 'saveConfig': requireKey_(req.key); return saveConfig_(req.config);
  }
  throw new Error('Unknown action: ' + req.action);
}

/**
 * The admin key is a shared passphrase, not real authentication. It keeps a
 * curious chef out of the settings page; it will not stop anyone determined.
 * Set it once: Project Settings > Script Properties > ADMIN_KEY.
 */
function requireKey_(key) {
  const want = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!want) throw new Error('No ADMIN_KEY is set on the script yet.');
  if (String(key || '') !== want) throw new Error('That key is not right.');
}

/* ---------------- catalog ---------------- */

function readCatalog_() {
  const sh = ss_().getSheetByName(CATALOG);
  const rows = sh.getDataRange().getValues();
  rows.shift();
  return rows.filter(r => r[0]).map(r => ({
    id: String(r[0]),
    name: String(r[1]),
    section: String(r[2]),
    unit: String(r[3]),
    price: Number(r[4]) || 0,
    offered: r[5] === true,
    cap: (r[6] === '' || r[6] === null) ? null : Number(r[6]),
    sort: Number(r[7]) || 0
  }));
}

function saveCrop_(id, patch) {
  const sh = ss_().getSheetByName(CATALOG);
  const ids = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues().flat();
  const i = ids.indexOf(id);
  if (i < 0) throw new Error('No crop with id ' + id);
  const row = i + 2;
  const col = { name: 2, section: 3, unit: 4, price: 5, offered: 6, cap: 7, sort: 8 };
  Object.keys(patch).forEach(k => {
    if (!col[k]) return;
    const v = (k === 'cap' && (patch[k] === null || patch[k] === '')) ? '' : patch[k];
    sh.getRange(row, col[k]).setValue(v);
  });
  return { id: id };
}

function addCrop_(crop) {
  const sh = ss_().getSheetByName(CATALOG);
  const existing = readCatalog_().map(c => c.id);
  let base = String(crop.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 40) || 'crop';
  let id = base, n = 2;
  while (existing.indexOf(id) > -1) id = base + '-' + (n++);

  const peers = readCatalog_().filter(c => c.section === crop.section).map(c => c.sort);
  const sort = (peers.length ? Math.max.apply(null, peers) : 0) + 10;

  // A new offering is a new ROW. The columns never change — that is what keeps
  // the Orders tab pivotable season over season.
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 8).setValues([[
    id, crop.name, crop.section, crop.unit || '1 lb', Number(crop.price) || 0,
    true, '', sort
  ]]);
  sh.getRange(row, 6).insertCheckboxes();
  return { id: id };
}

/* ---------------- config ---------------- */

function readConfig_() {
  const sh = ss_().getSheetByName(CONFIG);
  const out = {};
  sh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) out[r[0]] = r[1]; });
  if (out.deliveryThu instanceof Date) out.deliveryThu = iso_(out.deliveryThu);
  return out;
}

function saveConfig_(cfg) {
  const sh = ss_().getSheetByName(CONFIG);
  const keys = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues().flat();
  Object.keys(cfg).forEach(k => {
    const i = keys.indexOf(k);
    if (i > -1) sh.getRange(i + 2, 2).setValue(cfg[k]);
    else sh.appendRow([k, cfg[k]]);
  });
  return readConfig_();
}

function iso_(d) {
  return Utilities.formatDate(d, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

/** Monday of the week containing the delivery Thursday — the grouping key. */
function weekKey_(deliveryThu) {
  const thu = new Date(deliveryThu + 'T12:00:00');
  thu.setDate(thu.getDate() - 3);
  return thu.toISOString().slice(0, 10);
}

/* ---------------- orders ---------------- */

function readOrders_() {
  const sh = ss_().getSheetByName(ORDERS);
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getDataRange().getValues();
  rows.shift();
  return rows.filter(r => r[0]).map(r => ({
    orderId: String(r[0]), placed: r[1], weekKey: String(r[2]),
    restaurant: String(r[3]), contact: String(r[4]),
    email: String(r[5] || ''), phone: String(r[6] || ''),
    fulfillment: String(r[7] || ''), deliveryAddress: String(r[8] || ''),
    cropId: String(r[9]), name: String(r[10]), section: String(r[11]), unit: String(r[12]),
    price: Number(r[13]) || 0, qty: Number(r[14]) || 0, lineTotal: Number(r[15]) || 0,
    notes: String(r[16] || ''), status: String(r[17] || '')
  }));
}

/** Units of each crop already claimed for the current delivery week. */
function claimed_(weekKey) {
  const out = {};
  readOrders_().forEach(o => {
    if (o.weekKey !== weekKey) return;
    out[o.cropId] = (out[o.cropId] || 0) + o.qty;
  });
  return out;
}

/** What a restaurant is allowed to see: the week, and what's still available. */
function publicWeek_() {
  const cfg = readConfig_();
  const wk = weekKey_(cfg.deliveryThu);
  const taken = claimed_(wk);
  const crops = readCatalog_()
    .filter(c => c.offered)
    .sort((a, b) => a.sort - b.sort)
    .map(c => ({
      id: c.id, name: c.name, section: c.section, unit: c.unit, price: c.price,
      remaining: c.cap === null ? null : Math.max(0, c.cap - (taken[c.id] || 0))
    }));
  return { config: { deliveryThu: cfg.deliveryThu }, crops: crops };
}

/** Everything the farm sees. Never reachable without the admin key. */
function adminData_() {
  const cfg = readConfig_();
  const wk = weekKey_(cfg.deliveryThu);
  return {
    config: cfg,
    weekKey: wk,
    claimed: claimed_(wk),
    catalog: readCatalog_().sort((a, b) => a.sort - b.sort),
    orders: readOrders_()
  };
}

/**
 * Append one row per crop ordered. The availability check happens inside the
 * lock — checking it before would let two restaurants both pass on the last
 * twenty pounds of shishitos.
 */
function placeOrder_(order) {
  if (!order || !order.items || !order.items.length) throw new Error('That order was empty.');
  if (!order.restaurant || !order.contact || !order.email || !order.phone)
    throw new Error('Company name, contact name, email, and phone are all required.');
  if (!order.fulfillment)
    throw new Error('Please indicate pickup or delivery.');
  if (order.fulfillment === 'Delivery' && !order.deliveryAddress)
    throw new Error('A delivery address is required for delivery orders.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('The farm is busy saving another order. Try again in a moment.');

  try {
    const cfg = readConfig_();
    const wk = weekKey_(cfg.deliveryThu);
    const cat = {}; readCatalog_().forEach(c => cat[c.id] = c);
    const taken = claimed_(wk);

    const short = [];
    order.items.forEach(it => {
      const c = cat[it.cropId];
      if (!c || !c.offered) throw new Error(c ? (c.name + ' is no longer offered this week.') : 'Unknown crop.');
      if (c.cap !== null) {
        const left = Math.max(0, c.cap - (taken[c.id] || 0));
        if (Number(it.qty) > left) short.push({ name: c.name, left: left });
      }
    });
    if (short.length) {
      throw new Error('Another restaurant just claimed some of the ' + short[0].name +
        '. Only ' + short[0].left + ' left — adjust and resend.');
    }

    const now = new Date();
    const tz = ss_().getSpreadsheetTimeZone();
    const orderId = 'ORD-' + Utilities.formatDate(now, tz, 'yyMMdd') + '-' +
      Math.floor(Math.random() * 900 + 100);

    const rows = order.items.filter(it => Number(it.qty) > 0).map(it => {
      const c = cat[it.cropId];
      return [orderId, now, wk, order.restaurant, order.contact,
              order.email || '', order.phone || '',
              order.fulfillment || '', order.deliveryAddress || '',
              c.id, c.name, c.section,
              c.unit, c.price, Number(it.qty), c.price * Number(it.qty),
              order.notes || '', 'New'];
    });

    const sh = ss_().getSheetByName(ORDERS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 18).setValues(rows);

    const total = rows.reduce((s, r) => s + r[11], 0);
    notify_(order, rows, orderId, total);
    return { orderId: orderId, lines: rows.length, total: total };
  } finally {
    lock.releaseLock();
  }
}

function notify_(order, rows, orderId, total) {
  try {
    const to = readConfig_().notifyEmail;
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: 'New order ' + orderId + ' — ' + order.restaurant + ' — $' + total.toFixed(2),
      body: [
        order.restaurant,
        order.contact + '  ' + order.email + '  ' + order.phone,
        order.fulfillment + (order.deliveryAddress ? ': ' + order.deliveryAddress : ''),
        ''
      ].concat(
        rows.map(r => '  ' + r[14] + ' x ' + r[12] + '  ' + r[10] + '   $' + r[15].toFixed(2)),
        ['', 'Total: $' + total.toFixed(2), order.notes ? '\nNotes: ' + order.notes : '']
      ).join('\n')
    });
  } catch (err) {
    // The rows are already written. A failed email must never lose an order.
    console.error('Notification failed: ' + err);
  }
}

/* ---------------- one-time setup ---------------- */

function setupSheets() {
  const ss = ss_();

  let cat = ss.getSheetByName(CATALOG) || ss.insertSheet(CATALOG);
  cat.clear();
  cat.getRange('A1:H1').setValues([['ID','Crop','Section','Unit','Price','Offered','Units available','Sort']])
     .setFontWeight('bold');
  const crops = [
    ['thai-basil','Thai Basil','Herbs','1 lb',8,true,'',10],
    ['tulsi-basil','Tulsi Basil','Herbs','1 lb',8,true,'',20],
    ['thyme','Thyme','Herbs','0.5 lb',7,true,'',30],
    ['rosemary','Rosemary','Herbs','0.5 lb',7,true,'',40],
    ['oregano','Oregano','Herbs','0.5 lb',7,false,'',50],
    ['lemon-verbena','Lemon Verbena','Herbs','0.5 lb',5,true,'',60],
    ['chives','Chives','Herbs','0.5 lb',5,true,'',70],
    ['flower-mix','Seasonal Edible Flower Mix','Flowers','per flower',0.25,true,'',10],
    ['zinnia','Zinnia','Flowers','per stem',1,true,'',20],
    ['shishito','Shishito Peppers','Other Produce','1 lb',5,true,'',10],
    ['cayenne','Cayenne Peppers','Other Produce','0.5 lb',5,false,'',20],
    ['jalapeno','Jalapeño Peppers','Other Produce','1 lb',5,true,'',30],
    ['acorn-squash','Acorn Squash','Other Produce','1 lb',1,false,'',40],
    ['ginger','Ginger','Other Produce','1 lb',2,false,'',50]
  ];
  cat.getRange(2, 1, crops.length, 8).setValues(crops);
  cat.getRange(2, 6, crops.length, 1).insertCheckboxes();
  cat.getRange(2, 5, crops.length, 1).setNumberFormat('$#,##0.00');
  cat.setFrozenRows(1);
  cat.hideColumns(1);
  cat.autoResizeColumns(2, 7);

  let ord = ss.getSheetByName(ORDERS) || ss.insertSheet(ORDERS);
  if (ord.getLastRow() === 0) {
    ord.getRange('A1:R1').setValues([['Order ID','Placed','Delivery week','Company','Contact name',
      'Contact email','Contact phone','Fulfillment','Delivery address',
      'Crop ID','Crop','Section','Unit','Unit price','Qty','Line total','Notes','Status']])
       .setFontWeight('bold');
    ord.getRange('N:N').setNumberFormat('$#,##0.00');
    ord.getRange('P:P').setNumberFormat('$#,##0.00');
    ord.setFrozenRows(1);
  }

  let cfg = ss.getSheetByName(CONFIG) || ss.insertSheet(CONFIG);
  cfg.clear();
  const d = new Date();
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7));
  cfg.getRange('A1:B4').setValues([
    ['Setting', 'Value'],
    ['deliveryThu', iso_(d)],
    ['notifyEmail', Session.getActiveUser().getEmail()],
    ['farmName', 'Farming Falmouth Speciality Crops']
  ]);
  cfg.getRange('A1:B1').setFontWeight('bold');
  cfg.setFrozenRows(1);

  SpreadsheetApp.getUi().alert(
    'Sheets are ready.\n\nNext: Project Settings > Script Properties > add ADMIN_KEY, ' +
    'then Deploy > New deployment > Web app (Execute as Me, Access Anyone).');
}
