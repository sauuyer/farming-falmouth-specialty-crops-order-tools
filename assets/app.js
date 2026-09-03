/* Farming Falmouth Speciality Crops — front end.
   Each page sets window.MODE ("restaurant" or "admin") before loading this.
   API_URL comes from config.js. */

const SECTIONS = ["Herbs", "Flowers", "Other Produce"];

let tab = "settings", sent = null, addingTo = null, adminKey = "", summaryWeek = null;
let config = {}, catalog = [], crops = [], orders = [], claimedMap = {};
let draft = {};
let booted = false;

const $ = s => document.querySelector(s);
const money = n => "$" + (Math.round(n * 100) / 100).toFixed(2);
const esc = s => String(s == null ? "" : s)
  .replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

/* ---------- API ----------
   POST with text/plain on purpose: it is a "simple request", so the browser
   skips the CORS preflight that Apps Script cannot answer. */
async function api(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow"
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || "Something went wrong.");
  return body.data;
}

/* ---------- dates ---------- */
const parseISO = s => new Date(s + "T12:00:00");
const md = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function weekDates() {
  const thu = parseISO(config.deliveryThu || new Date().toISOString().slice(0, 10));
  const wed = new Date(thu); wed.setDate(thu.getDate() - 1);
  const mon = new Date(thu); mon.setDate(thu.getDate() - 3);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const span = mon.getMonth() === sun.getMonth()
    ? md(mon) + "–" + sun.getDate()
    : md(mon) + " – " + md(sun);
  return { thu, wed, mon, span };
}

/* remaining for a crop, from whichever shape this page has loaded */
function remainingOf(c) {
  if (c.remaining !== undefined) return c.remaining;                 // restaurant payload
  if (c.cap === null || c.cap === undefined || c.cap === "") return null;
  return Math.max(0, Number(c.cap) - (claimedMap[c.id] || 0));       // admin payload
}

/* ---------- boot ---------- */
async function boot() {
  paintHeader();
  if (MODE === "restaurant") {
    try {
      const d = await api({ action: "week" });
      config = d.config; crops = d.crops;
      booted = true;
    } catch (e) {
      $("#view").innerHTML = `<div class="notice err">Couldn't reach the farm: ${esc(e.message)}</div>`;
      return;
    }
  } else {
    const saved = sessionStorage.getItem("ff_key");
    if (saved) { adminKey = saved; if (!(await loadAdmin())) return renderKeyPrompt(); }
    else return renderKeyPrompt();
  }
  render();
}

async function loadAdmin() {
  try {
    const d = await api({ action: "admin", key: adminKey });
    config = d.config; catalog = d.catalog; orders = d.orders; claimedMap = d.claimed;
    booted = true;
    sessionStorage.setItem("ff_key", adminKey);
    return true;
  } catch (e) {
    sessionStorage.removeItem("ff_key");
    return false;
  }
}

function renderKeyPrompt() {
  $("#tabs").style.display = "none";
  $("#view").innerHTML = `<div class="orderbox" style="max-width:420px">
    <h2>Farm console</h2>
    <div class="f"><label for="k">Access key</label>
      <input class="inp" id="k" type="password" autocomplete="current-password"></div>
    <div id="kerr"></div>
    <button class="btn" id="kgo" style="margin-top:14px">Open console</button>
  </div>`;
  $("#k").focus();
  $("#k").addEventListener("keydown", e => { if (e.key === "Enter") $("#kgo").click(); });
  $("#kgo").onclick = async () => {
    adminKey = $("#k").value.trim();
    $("#kgo").disabled = true; $("#kgo").textContent = "Checking…";
    if (await loadAdmin()) render();
    else {
      $("#kerr").innerHTML = `<div class="notice err" style="margin:12px 0 0">That key isn't right.</div>`;
      $("#kgo").disabled = false; $("#kgo").textContent = "Open console";
    }
  };
}

/* ---------- render ---------- */
function paintHeader() {
  const w = weekDates();
  $("#dWeek").textContent = booted ? w.span : "—";
  $("#dOrder").textContent = booted ? md(w.wed) : "—";
  $("#dDeliver").textContent = booted ? md(w.thu) : "—";
}

function render() {
  paintHeader();
  if (MODE === "admin") {
    $("#tabs").style.display = "flex";
    document.querySelectorAll("#tabs button").forEach(b =>
      b.setAttribute("aria-selected", b.dataset.tab === tab));
  }
  const v = $("#view");
  if (MODE === "restaurant") v.innerHTML = orderFormHTML(false);
  else if (tab === "form") v.innerHTML = orderFormHTML(true);
  else if (tab === "settings") v.innerHTML = settingsHTML();
  else if (tab === "summary") v.innerHTML = summaryHTML();
  else v.innerHTML = ordersHTML();
}

function settingsHTML() {
  let h = `<p class="lede">Turn on whatever you can cut this week. Set the unit and the price the way
    you'd say it out loud to a chef. Units available is optional — fill it in and the order form counts
    down as orders arrive, so two restaurants can't claim the same thirty pounds of shishitos.</p>
    <div class="orderbox" style="margin-top:0;margin-bottom:26px">
      <h2>Delivery week</h2>
      <div class="grid2">
        <div class="f"><label for="thuPick">Delivery Thursday</label>
          <input class="inp" type="date" id="thuPick" value="${esc(config.deliveryThu || "")}"></div>
        <div class="f"><label>Orders close</label>
          <div style="padding:7px 0;font-weight:600">Wednesday ${md(weekDates().wed)}</div></div>
      </div>
    </div>`;

  SECTIONS.forEach(sec => {
    const items = catalog.filter(c => c.section === sec).sort((a, b) => a.sort - b.sort);
    const on = items.filter(c => c.offered).length;
    h += `<section class="section">
      <div class="section-head"><h2>${sec}</h2>
        <span class="count">${on} of ${items.length} offered this week</span></div>
      <div class="panel">`;
    items.forEach(c => {
      const rem = remainingOf(c);
      h += `<div class="frow ${c.offered ? "on" : "off"}">
        <div><button class="toggle" data-toggle="${c.id}" aria-pressed="${c.offered}">
          <span class="dot">✓</span>${c.offered ? "Offering this week" : "Not this week"}</button></div>
        <div class="cropname-cell"><div class="cropname">${esc(c.name)}</div></div>
        <div><span class="fieldlab">Unit</span><input class="inp" type="text" value="${esc(c.unit)}"
          data-unit="${c.id}" ${c.offered ? "" : "disabled"} aria-label="${esc(c.name)} unit"></div>
        <div><span class="fieldlab">Price</span><div class="money">$<input class="inp" type="number"
          min="0" step="0.25" value="${c.price}" data-price="${c.id}" ${c.offered ? "" : "disabled"}
          aria-label="${esc(c.name)} price"></div></div>
        <div><span class="fieldlab">Units available</span><input class="inp" type="number" min="0" step="1"
          placeholder="no limit" value="${c.cap === null || c.cap === undefined ? "" : c.cap}"
          data-cap="${c.id}" ${c.offered ? "" : "disabled"}
          aria-label="${esc(c.name)} units available this week">
          ${c.offered && rem !== null ? `<div style="font-size:11.5px;color:var(--muted);margin-top:3px">${rem} left after orders in</div>` : ""}
        </div></div>`;
    });
    if (addingTo === sec) {
      h += `<div class="addform">
        <div class="wide"><label for="nName">Crop name</label>
          <input class="inp" id="nName" type="text" placeholder="Nasturtium"></div>
        <div><label for="nUnit">Unit</label><input class="inp" id="nUnit" type="text" placeholder="1 lb"></div>
        <div><label for="nPrice">Price</label><input class="inp" id="nPrice" type="number" min="0" step="0.25" placeholder="6"></div>
        <button class="btn" data-save-new="${sec}">Add</button>
        <button class="btn ghost" data-cancel-new="1">Cancel</button></div>`;
    } else {
      h += `<button class="addbtn" data-add="${sec}">+ Add a crop to ${sec}</button>`;
    }
    h += `</div></section>`;
  });
  return h;
}

function orderFormHTML(isPreview) {
  if (sent) {
    return `<div class="done"><b>Order received</b>
      <p>${sent.orderId} — ${sent.lines} line${sent.lines > 1 ? "s" : ""}, ${money(sent.total)}.
      The farm has a copy and will be in touch if anything comes up short.</p>
      <button class="btn ghost" id="again">Place another order</button></div>`;
  }
  const list = MODE === "restaurant" ? crops : catalog.filter(c => c.offered);
  let h = isPreview
    ? `<p class="lede">Exactly what a restaurant sees at your order link. They can't reach this
       console, the offerings settings, or the order records.</p>`
    : `<p class="lede">Here's what's coming out of the field this week. Enter quantities for what you
       want and leave the rest blank.</p>`;

  if (!list.length) return h + `<div class="panel"><div class="empty"><b>Nothing posted yet</b>
    Check back once the farm sets this week's list.</div></div>`;

  SECTIONS.forEach(sec => {
    const items = list.filter(c => c.section === sec).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    if (!items.length) return;
    h += `<section class="section"><div class="section-head"><h2>${sec}</h2></div><div class="panel">`;
    items.forEach(c => {
      const rem = remainingOf(c), out = rem === 0, q = draft[c.id] || 0;
      let stock, cls;
      if (rem === null) { stock = "Ask for any quantity"; cls = "any"; }
      else if (out) { stock = "Fully spoken for"; cls = "out"; }
      else if (rem <= 5) { stock = rem + " left this week"; cls = "low"; }
      else { stock = rem + " available"; cls = ""; }
      h += `<div class="crow ${out ? "sold" : ""}">
        <div><div class="cropname">${esc(c.name)}</div>
          <div class="sub">${money(c.price)} per ${esc(c.unit)}</div></div>
        <div class="stockcell"><span class="stock ${cls}">${stock}</span></div>
        <div><input class="inp" type="number" min="0" step="1" placeholder="0" value="${q || ""}"
          data-qty="${c.id}" ${out ? "disabled" : ""} ${rem !== null ? `max="${rem}"` : ""}
          aria-label="Quantity of ${esc(c.name)}"></div>
        <div class="line ${q ? "" : "zero"}">${money(q * c.price)}</div></div>`;
    });
    h += `</div></section>`;
  });

  const picked = list.filter(c => (draft[c.id] || 0) > 0);
  const total = picked.reduce((s, c) => s + draft[c.id] * c.price, 0);
  const addrVis = draft._fulfill === "Delivery";
  h += `<div class="orderbox"><h2>Your details</h2><div class="grid2">
      <div class="f"><label for="oRest">Company name</label><input class="inp" id="oRest" type="text"
        value="${esc(draft._rest || "")}" placeholder="Cardinal &amp; Crow"></div>
      <div class="f"><label for="oName">Contact name</label><input class="inp" id="oName" type="text"
        value="${esc(draft._name || "")}" placeholder="Sam Smith"></div>
      <div class="f"><label for="oEmail">Contact email</label><input class="inp" id="oEmail" type="email"
        value="${esc(draft._email || "")}" placeholder="sam@cardinal-crow.com"></div>
      <div class="f"><label for="oPhone">Contact phone</label><input class="inp" id="oPhone" type="tel"
        value="${esc(draft._phone || "")}" placeholder="508-555-0144"></div>
      <div class="f wide"><label>Fulfillment</label><div class="radio-group">
        <label class="radio-label"><input type="radio" name="oFulfill" value="Pickup"${draft._fulfill === "Pickup" ? " checked" : ""}> Pickup</label>
        <label class="radio-label"><input type="radio" name="oFulfill" value="Delivery"${draft._fulfill === "Delivery" ? " checked" : ""}> Delivery</label>
      </div></div>
      <div class="f wide" id="oAddrWrap"${addrVis ? "" : ' style="display:none"'}><label for="oAddr">Delivery address &amp; instructions</label>
        <textarea class="inp" id="oAddr" placeholder="123 Main St, Falmouth MA 02540 — leave at back door">${esc(draft._addr || "")}</textarea></div>
      <div class="f wide"><label for="oNotes">Special requests or notes</label><textarea class="inp" id="oNotes"
        placeholder="No changes once submitted.">${esc(draft._notes || "")}</textarea></div>
      <div class="f wide"><label class="check-label"><input type="checkbox" id="oTerms"${draft._terms ? " checked" : ""}>&ensp;I understand
        orders are fulfilled first-come, first-served. My order is not confirmed until I hear back from Farming Falmouth.</label></div>
    </div><div id="oErr"></div></div>
  <div class="stickybar"><div class="tot">${money(total)}<small>${picked.length
      ? picked.length + (picked.length === 1 ? " crop" : " crops") + " selected"
      : "Nothing selected yet"}</small></div>
    <button class="btn big" id="place" ${picked.length ? "" : "disabled"}>Send order</button></div>`;
  return h;
}

function ordersHTML() {
  const rows = orders.slice().sort((a, b) => String(b.placed).localeCompare(String(a.placed)));
  const wk = weekDates().mon.toISOString().slice(0, 10);
  const wkRows = rows.filter(r => r.weekKey === wk);
  const weekTotal = wkRows.reduce((s, r) => s + r.lineTotal, 0);
  const allTotal = rows.reduce((s, r) => s + r.lineTotal, 0);
  const rests = new Set(wkRows.map(r => r.restaurant)).size;

  let h = `<p class="lede">One row per crop ordered — never one column per crop. A new offering adds a
    row here, never a column, which is what keeps this pivotable into a season-over-season sales report
    instead of a widening field of blank cells.</p>
    <div class="stats">
      <div class="stat"><span class="lab">This week</span><b>${money(weekTotal)}</b></div>
      <div class="stat"><span class="lab">Restaurants ordering</span><b>${rests}</b></div>
      <div class="stat"><span class="lab">Season to date</span><b>${money(allTotal)}</b></div>
    </div>
    <div class="toolbar"><button class="btn ghost" id="csv">Download CSV</button>
      <a class="btn ghost" href="${esc(SHEET_URL)}" target="_blank" rel="noopener"
         style="text-decoration:none;display:inline-block">Open the spreadsheet</a></div>`;

  if (!rows.length) return h + `<div class="panel"><div class="empty"><b>No orders yet</b>
    Send one from the order form preview and the rows land here.</div></div>`;

  h += `<div class="scroll"><table><thead><tr><th>Order ID</th><th>Placed</th><th>Delivery week</th>
    <th>Company</th><th>Contact</th><th>Email</th><th>Phone</th><th>Fulfillment</th><th>Delivery address</th>
    <th>Crop</th><th>Section</th><th>Unit</th>
    <th class="num">Unit price</th><th class="num">Qty</th><th class="num">Line total</th>
    </tr></thead><tbody>`;
  rows.forEach(r => {
    const placed = r.placed ? new Date(r.placed).toLocaleDateString("en-US",
      { month: "short", day: "numeric" }) : "";
    h += `<tr><td>${esc(r.orderId)}</td><td>${placed}</td><td>${esc(r.weekKey)}</td>
      <td>${esc(r.restaurant)}</td><td>${esc(r.contact)}</td><td>${esc(r.email)}</td>
      <td>${esc(r.phone)}</td><td>${esc(r.fulfillment)}</td><td class="addr">${esc(r.deliveryAddress)}</td>
      <td>${esc(r.name)}</td><td>${esc(r.section)}</td><td>${esc(r.unit)}</td>
      <td class="num">${money(r.price)}</td>
      <td class="num">${r.qty}</td><td class="num">${money(r.lineTotal)}</td></tr>`;
  });
  return h + `</tbody></table></div>`;
}

function summaryHTML() {
  const allWeeks = [...new Set(orders.map(r => r.weekKey))].sort((a, b) => b.localeCompare(a));
  const currentWk = weekDates().mon.toISOString().slice(0, 10);
  if (!summaryWeek || !allWeeks.includes(summaryWeek))
    summaryWeek = allWeeks.includes(currentWk) ? currentWk : (allWeeks[0] || currentWk);

  let h = `<p class="lede">One row per company — quantities ordered per crop and total owed for the selected week.</p>`;

  if (allWeeks.length) {
    h += `<div class="toolbar"><label for="sumWeek" style="font-size:13px;color:var(--muted);margin-right:8px">Week of</label>
      <select class="inp" id="sumWeek" style="width:auto">`;
    allWeeks.forEach(wk => {
      h += `<option value="${esc(wk)}"${wk === summaryWeek ? " selected" : ""}>${esc(wk)}</option>`;
    });
    h += `</select></div>`;
  }

  const wkRows = orders.filter(r => r.weekKey === summaryWeek);
  if (!wkRows.length) return h + `<div class="panel"><div class="empty">
    <b>No orders for this week yet</b>Orders placed by restaurants will appear here once
    the week is active.</div></div>`;

  const companies = [...new Set(wkRows.map(r => r.restaurant))].sort();

  const cropMeta = {};
  wkRows.forEach(r => { cropMeta[r.cropId] = { name: r.name, section: r.section, unit: r.unit, price: r.price }; });
  const cropIds = Object.keys(cropMeta).sort((a, b) => {
    const si = SECTIONS.indexOf(cropMeta[a].section), sj = SECTIONS.indexOf(cropMeta[b].section);
    return si !== sj ? si - sj : cropMeta[a].name.localeCompare(cropMeta[b].name);
  });

  const matrix = {}, companyTotal = {};
  wkRows.forEach(r => {
    if (!matrix[r.restaurant]) matrix[r.restaurant] = {};
    const cell = matrix[r.restaurant][r.cropId] || { qty: 0, lineTotal: 0 };
    cell.qty += r.qty; cell.lineTotal += r.lineTotal;
    matrix[r.restaurant][r.cropId] = cell;
    companyTotal[r.restaurant] = (companyTotal[r.restaurant] || 0) + r.lineTotal;
  });

  const weekTotal = wkRows.reduce((s, r) => s + r.lineTotal, 0);
  h += `<div class="stats">
    <div class="stat"><span class="lab">Week revenue</span><b>${money(weekTotal)}</b></div>
    <div class="stat"><span class="lab">Companies</span><b>${companies.length}</b></div>
  </div>`;

  h += `<div class="scroll"><table><thead><tr>
    <th>Company</th><th>Contact</th><th>Fulfillment</th>`;
  cropIds.forEach(id => {
    h += `<th class="num">${esc(cropMeta[id].name)}
      <div class="colsub">${esc(cropMeta[id].unit)} · ${money(cropMeta[id].price)}</div></th>`;
  });
  h += `<th class="num">Total owed</th></tr></thead><tbody>`;

  companies.forEach(company => {
    const info = wkRows.find(r => r.restaurant === company);
    h += `<tr><td><b>${esc(company)}</b></td>
      <td>${esc(info.contact)}<div class="colsub">${esc(info.phone)}</div></td>
      <td>${esc(info.fulfillment)}${info.deliveryAddress
        ? `<div class="colsub addr">${esc(info.deliveryAddress)}</div>` : ""}</td>`;
    cropIds.forEach(id => {
      const cell = (matrix[company] || {})[id];
      h += cell ? `<td class="num">${cell.qty}</td>` : `<td class="num dim">—</td>`;
    });
    h += `<td class="num"><b>${money(companyTotal[company] || 0)}</b></td></tr>`;
  });

  h += `<tr class="sumrow"><td colspan="3"><b>Total</b></td>`;
  cropIds.forEach(id => {
    const total = wkRows.filter(r => r.cropId === id).reduce((s, r) => s + r.qty, 0);
    h += `<td class="num"><b>${total}</b></td>`;
  });
  h += `<td class="num"><b>${money(weekTotal)}</b></td></tr>`;

  return h + `</tbody></table></div>`;
}

/* ---------- events ---------- */
if (MODE === "admin") {
  $("#tabs").addEventListener("click", e => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; sent = null; render(); }
  });
}

document.addEventListener("click", async e => {
  const t = e.target;

  const tog = t.closest("[data-toggle]");
  if (tog) {
    const c = catalog.find(x => x.id === tog.dataset.toggle);
    c.offered = !c.offered;
    render();
    try { await api({ action: "saveCrop", key: adminKey, id: c.id, patch: { offered: c.offered } }); }
    catch (err) { c.offered = !c.offered; render(); alert(err.message); }
    return;
  }
  if (t.dataset.add) {
    addingTo = t.dataset.add; render();
    setTimeout(() => { const n = $("#nName"); if (n) n.focus(); }, 0); return;
  }
  if (t.dataset.cancelNew) { addingTo = null; render(); return; }

  if (t.dataset.saveNew) {
    const name = $("#nName").value.trim();
    if (!name) { $("#nName").focus(); return; }
    const crop = { name, section: t.dataset.saveNew, unit: $("#nUnit").value.trim() || "1 lb",
                   price: Number($("#nPrice").value) || 0 };
    t.disabled = true; t.textContent = "Adding…";
    try {
      const r = await api({ action: "addCrop", key: adminKey, crop });
      catalog.push({ ...crop, id: r.id, offered: true, cap: null,
        sort: Math.max(0, ...catalog.filter(c => c.section === crop.section).map(c => c.sort)) + 10 });
      addingTo = null; render();
    } catch (err) { t.disabled = false; t.textContent = "Add"; alert(err.message); }
    return;
  }

  if (t.id === "again") { sent = null; draft = {}; render(); return; }

  if (t.id === "csv") {
    const head = ["Order ID","Placed","Delivery week","Company","Contact","Email","Phone",
                  "Fulfillment","Delivery address","Crop","Section","Unit","Unit price","Qty","Line total"];
    const lines = [head.join(",")].concat(orders.map(r => [r.orderId, r.placed, r.weekKey,
      r.restaurant, r.contact, r.email, r.phone, r.fulfillment, r.deliveryAddress,
      r.name, r.section, r.unit, r.price, r.qty, r.lineTotal.toFixed(2)]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "farming-falmouth-orders.csv"; a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (t.id === "place") {
    const rest   = $("#oRest").value.trim();
    const name   = $("#oName").value.trim();
    const email  = $("#oEmail").value.trim();
    const phone  = $("#oPhone").value.trim();
    const fulfill = draft._fulfill || "";
    const addr   = ($("#oAddr") ? $("#oAddr").value.trim() : "");
    const terms  = $("#oTerms") && $("#oTerms").checked;

    const firstEmpty = !rest ? "#oRest" : !name ? "#oName" : !email ? "#oEmail" : !phone ? "#oPhone" : null;
    if (firstEmpty) {
      $("#oErr").innerHTML = `<div class="notice err" style="margin:14px 0 0">Please fill in all contact fields before sending.</div>`;
      $(firstEmpty).focus(); return;
    }
    if (!fulfill) {
      $("#oErr").innerHTML = `<div class="notice err" style="margin:14px 0 0">Please choose pickup or delivery.</div>`;
      return;
    }
    if (fulfill === "Delivery" && !addr) {
      $("#oErr").innerHTML = `<div class="notice err" style="margin:14px 0 0">Please add a delivery address and any instructions.</div>`;
      $("#oAddr").focus(); return;
    }
    if (!terms) {
      $("#oErr").innerHTML = `<div class="notice err" style="margin:14px 0 0">Please check the acknowledgment before sending.</div>`;
      return;
    }
    const list = MODE === "restaurant" ? crops : catalog.filter(c => c.offered);
    const picked = list.filter(c => (draft[c.id] || 0) > 0);
    if (!picked.length) return;

    t.disabled = true; t.textContent = "Sending…";
    try {
      // The farm re-checks availability inside its own lock; this can still fail here.
      sent = await api({ action: "order", order: {
        restaurant: rest, contact: name, email, phone,
        fulfillment: fulfill, deliveryAddress: addr,
        notes: $("#oNotes").value.trim(),
        items: picked.map(c => ({ cropId: c.id, qty: draft[c.id] }))
      }});
      draft = {};
      if (MODE === "restaurant") { const d = await api({ action: "week" }); crops = d.crops; }
      else await loadAdmin();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      t.disabled = false; t.textContent = "Send order";
      $("#oErr").innerHTML = `<div class="notice warn" style="margin:14px 0 0">${esc(err.message)}</div>`;
    }
  }
});

let timers = {};
document.addEventListener("input", e => {
  const t = e.target, d = t.dataset;

  if (d.qty !== undefined) {
    const list = MODE === "restaurant" ? crops : catalog;
    const c = list.find(x => x.id === d.qty);
    const rem = remainingOf(c);
    let q = Math.max(0, Math.floor(Number(t.value) || 0));
    if (rem !== null && q > rem) { q = rem; t.value = rem; }
    draft[d.qty] = q;
    const cell = t.closest(".crow").querySelector(".line");
    cell.textContent = money(q * c.price);
    cell.className = "line" + (q ? "" : " zero");
    updateBar(); return;
  }
  if (t.id === "oRest")   { draft._rest  = t.value; return; }
  if (t.id === "oName")   { draft._name  = t.value; return; }
  if (t.id === "oEmail")  { draft._email = t.value; return; }
  if (t.id === "oPhone")  { draft._phone = t.value; return; }
  if (t.id === "oAddr")   { draft._addr  = t.value; return; }
  if (t.id === "oNotes")  { draft._notes = t.value; return; }

  if (t.id === "thuPick" && t.value) {
    config.deliveryThu = t.value; paintHeader();
    debounce("cfg", () => api({ action: "saveConfig", key: adminKey,
      config: { deliveryThu: t.value } }).catch(err => alert(err.message)));
    return;
  }

  // Write catalog edits through without re-rendering, so the field keeps focus.
  let id = null, patch = null;
  if (d.unit !== undefined) { id = d.unit; patch = { unit: t.value }; }
  else if (d.price !== undefined) { id = d.price; patch = { price: Math.max(0, Number(t.value) || 0) }; }
  else if (d.cap !== undefined) {
    id = d.cap;
    patch = { cap: t.value === "" ? null : Math.max(0, Math.floor(Number(t.value) || 0)) };
  }
  if (!id) return;
  Object.assign(catalog.find(c => c.id === id), patch);
  debounce(id, () => api({ action: "saveCrop", key: adminKey, id, patch })
    .catch(err => alert(err.message)));
});

function debounce(key, fn) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(fn, 500);
}

function updateBar() {
  const bar = document.querySelector(".stickybar");
  if (!bar) return;
  const list = MODE === "restaurant" ? crops : catalog.filter(c => c.offered);
  const picked = list.filter(c => (draft[c.id] || 0) > 0);
  const total = picked.reduce((s, c) => s + draft[c.id] * c.price, 0);
  bar.querySelector(".tot").firstChild.nodeValue = money(total);
  bar.querySelector(".tot small").textContent = picked.length
    ? picked.length + (picked.length === 1 ? " crop" : " crops") + " selected"
    : "Nothing selected yet";
  bar.querySelector("#place").disabled = picked.length === 0;
}

document.addEventListener("change", e => {
  const t = e.target;
  if (t.name === "oFulfill") {
    draft._fulfill = t.value;
    const wrap = document.getElementById("oAddrWrap");
    if (wrap) wrap.style.display = t.value === "Delivery" ? "" : "none";
  }
  if (t.id === "oTerms") draft._terms = t.checked;
  if (t.id === "sumWeek") { summaryWeek = t.value; render(); }
});

boot();
