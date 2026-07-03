// ─── Firebase Setup ───────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDBwDgss8kfJiYJMPRhma4kCPYdCyjvy58",
  authDomain: "iharbor-9a729.firebaseapp.com",
  projectId: "iharbor-9a729",
  storageBucket: "iharbor-9a729.firebasestorage.app",
  messagingSenderId: "549784101262",
  appId: "1:549784101262:web:42dbb5cc7a5e3e9f1504df",
  measurementId: "G-65T4KBFMLP"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─── Admin Auth ───────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'iharbor2026';
let unsubscribeOrders = null; // holds the Firestore listener so we can detach on logout

document.addEventListener('DOMContentLoaded', function () {
  if (sessionStorage.getItem('iharbor_admin_logged_in') === 'true') {
    showDashboard();
  }

  document.getElementById('admin-password').addEventListener('keyup', function (e) {
    if (e.key === 'Enter') checkLogin();
  });
});

window.checkLogin = function () {
  const input   = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('login-error');

  if (input === ADMIN_PASSWORD) {
    sessionStorage.setItem('iharbor_admin_logged_in', 'true');
    errorEl.textContent = '';
    showDashboard();
  } else {
    errorEl.textContent = 'Incorrect password. Try again.';
  }
};

window.logout = function () {
  sessionStorage.removeItem('iharbor_admin_logged_in');
  // Detach Firestore listener
  if (unsubscribeOrders) { unsubscribeOrders(); unsubscribeOrders = null; }
  document.getElementById('admin-dashboard').style.display = 'none';
  document.getElementById('login-screen').style.display   = 'flex';
  document.getElementById('admin-password').value         = '';
};

function showDashboard() {
  document.getElementById('login-screen').style.display    = 'none';
  document.getElementById('admin-dashboard').style.display = 'block';
  listenForOrders();
}

// ─── Real-time Firestore Listener ─────────────────────────────────────────────
function listenForOrders() {
  const q = query(collection(db, 'orders'), orderBy('date', 'desc'));

  unsubscribeOrders = onSnapshot(q, snapshot => {
    const orders = snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));
    renderOrders(orders);
  }, err => {
    console.error('Firestore listener error:', err);
    document.getElementById('orders-list').innerHTML =
      '<p class="empty-state" style="color:#e74c3c;">Could not load orders. Check your Firebase config or security rules.</p>';
  });
}

// ─── Order Actions ────────────────────────────────────────────────────────────
window.refreshOrders = function () {
  // Real-time listener auto-refreshes; this is a no-op visual reassurance
  const btn = document.querySelector('.admin-actions button');
  if (btn) { btn.textContent = 'Refreshed ✓'; setTimeout(() => btn.textContent = 'Refresh', 1500); }
};

window.updateOrderStatus = async function (docId, newStatus) {
  try {
    await updateDoc(doc(db, 'orders', docId), { status: newStatus });
  } catch (e) {
    console.error('Failed to update status:', e);
    alert('Could not update order status.');
  }
};

// ─── Per-order Delivery Fee ────────────────────────────────────────────────────
// Admin sets this manually per order (e.g. after estimating distance/cost).
// Updates the order's total to itemsSubtotal + fee.
window.saveOrderDeliveryFee = async function (docId, rawFee, itemsSubtotal) {
  const statusEl = document.getElementById(`fee-status-${docId}`);
  const fee = parseFloat(rawFee);

  if (isNaN(fee) || fee < 0) {
    if (statusEl) { statusEl.textContent = 'Invalid amount.'; statusEl.style.color = '#e74c3c'; }
    return;
  }

  try {
    await updateDoc(doc(db, 'orders', docId), {
      deliveryFee: fee,
      total: itemsSubtotal + fee
    });
    if (statusEl) {
      statusEl.textContent = 'Saved ✓';
      statusEl.style.color = '#27ae60';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    }
  } catch (e) {
    console.error('Failed to save delivery fee:', e);
    if (statusEl) { statusEl.textContent = 'Could not save.'; statusEl.style.color = '#e74c3c'; }
  }
};

window.deleteOrder = async function (docId) {
  if (!confirm('Delete this order?')) return;
  try {
    await deleteDoc(doc(db, 'orders', docId));
  } catch (e) {
    console.error('Failed to delete order:', e);
    alert('Could not delete order.');
  }
};

window.clearAllOrders = async function () {
  if (!confirm('Are you sure you want to delete ALL orders? This cannot be undone.')) return;
  try {
    const snapshot = await getDocs(collection(db, 'orders'));
    const batch    = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (e) {
    console.error('Failed to clear orders:', e);
    alert('Could not clear orders.');
  }
};

// ─── POS Receipt Printer ──────────────────────────────────────────────────────
window.printReceipt = function (orderId) {
  // find the order from the last snapshot
  const order = _lastOrders.find(o => o._id === orderId);
  if (!order) { alert('Order not found.'); return; }

  const date  = order.date?.toDate ? order.date.toDate() : new Date();
  const dateStr = date.toLocaleString('en-PH', {
    year:'numeric', month:'short', day:'numeric',
    hour:'2-digit', minute:'2-digit'
  });

  const itemRows = (order.items || []).map(i => {
    const subtotal = (i.price * i.quantity).toFixed(2);
    const noteLine = i.notes ? `<tr><td colspan="3" style="font-size:14px;color:#000;padding-left:4px;">📝 ${i.notes}</td></tr>` : '';
    return `
      <tr>
        <td>${i.name}</td>
        <td style="text-align:center;">${i.quantity}</td>
        <td style="text-align:right;">₱${subtotal}</td>
      </tr>${noteLine}`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt – ${order._id}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 15px;
      width: 80mm;
      margin: 0 auto;
      padding: 10px 8px 20px;
      color: #000;
      background: #fff;
    }
    .center  { text-align: center; }
    .bold    { font-weight: bold; }
    .shop-name { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
    .tagline   { font-size: 15px; color: #070202; margin-bottom: 4px; }
    .divider   { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .divider-solid { border: none; border-top: 2px solid #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 18px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 3px; }
    td { padding: 2px 0; vertical-align: top; }
    .total-row td { font-weight: bold; font-size: 15px; padding-top: 4px; }
    .label  { color: #130707; font-size: 15px; }
    .value  { font-size: 15px; }
    .footer { text-align: center; font-size: 15px; color: #0e0707; margin-top: 10px; }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #000;
      border-radius: 10px;
      font-size: 15px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    @media print {
      body { width: 80mm; }
      button { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop-name">🌸 IHarbor</div>
    <div class="tagline">Flower Shop · Fresh Blooms, Delivered</div>
  </div>

  <hr class="divider-solid">

  <div class="center" style="font-size:10px;">
    <span class="label">Order ID:</span><br>
    <span class="bold" style="font-size:11px;">${order._id}</span><br>
    <span class="label">${dateStr}</span>
  </div>

  <hr class="divider">

  <table>
    <tr>
      <td class="label">Customer</td>
      <td class="value bold" style="text-align:right;">${escapeHtml(order.customerName)}</td>
    </tr>
    <tr>
      <td class="label">Phone</td>
      <td class="value" style="text-align:right;">${escapeHtml(order.customerPhone)}</td>
    </tr>
    ${order.hasOtherReceiver ? `
    <tr>
      <td class="label">Receiver</td>
      <td class="value" style="text-align:right;">${escapeHtml(order.receiverName || '')}</td>
    </tr>
    <tr>
      <td class="label">Receiver Phone</td>
      <td class="value" style="text-align:right;">${escapeHtml(order.receiverPhone || '')}</td>
    </tr>` : ''}
    <tr>
      <td class="label">Delivery</td>
      <td class="value" style="text-align:right;">${escapeHtml(order.deliveryOption)}</td>
    </tr>
    ${order.deliveryAddress ? `
    <tr>
      <td class="label">Address</td>
      <td class="value" style="text-align:right;">${escapeHtml(order.deliveryAddress)}</td>
    </tr>` : ''}
    ${order.landmark ? `
    <tr>
      <td class="label">Landmark</td>
      <td class="value" style="text-align:right;">${escapeHtml(order.landmark)}</td>
    </tr>` : ''}
    ${order.deliveryDate ? `
    <tr>
      <td class="label">Date</td>
      <td class="value" style="text-align:right;">📅 ${escapeHtml(order.deliveryDate)}</td>
    </tr>` : ''}
    ${order.deliveryTime ? `
    <tr>
      <td class="label">Time Slot</td>
      <td class="value" style="text-align:right;">🕐 ${escapeHtml(order.deliveryTime)}</td>
    </tr>` : ''}
    ${order.isSurprise ? `
    <tr>
      <td class="label">Surprise</td>
      <td class="value" style="text-align:right;">🎉 Yes${order.surpriseNote ? ` — ${escapeHtml(order.surpriseNote)}` : ''}</td>
    </tr>` : ''}
    <tr>
      <td class="label">Status</td>
      <td style="text-align:right;"><span class="status-badge">${escapeHtml(order.status)}</span></td>
    </tr>
  </table>

  <hr class="divider">

  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <hr class="divider-solid">

  <table>
    ${order.deliveryFee ? `
    <tr>
      <td colspan="2">Delivery Fee</td>
      <td style="text-align:right;">₱${order.deliveryFee.toFixed(2)}</td>
    </tr>` : ''}
    <tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td style="text-align:right;">₱${(order.total || 0).toFixed(2)}</td>
    </tr>
  </table>

  <hr class="divider">

  <div class="footer">
    Thank you for your order! 🌸<br>
    We'll contact you to confirm delivery.<br><br>
    IHarbor Flower Shop
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=950,height=900');
  win.document.write(html);
  win.document.close();
};

// Keep a reference to the last rendered orders for printReceipt
let _lastOrders = [];


// ─── Admin Map Viewer (OpenStreetMap / Leaflet) ───────────────────────────────
const SHOP_LAT  = 10.67867694326942;
const SHOP_LNG  = 122.41151199790903;
let adminMap    = null;

window.openAdminMap = function (lat, lng, address) {
  const modal = document.getElementById('admin-map-modal');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // Label + OSM deep-link
  const label   = document.getElementById('admin-map-address-label');
  const osmLink = document.getElementById('admin-map-osm-link');
  label.textContent = address || `${lat}, ${lng}`;
  osmLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  // Init map (or reset view if already created)
  if (adminMap) {
    adminMap.remove();
    adminMap = null;
  }

  setTimeout(() => {
    adminMap = L.map('admin-order-map').setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(adminMap);

    // Shop marker (green)
    const shopIcon = L.divIcon({
      className: '',
      html: `<div style="background:#27ae60;color:#fff;border-radius:50% 50% 50% 0;
               width:30px;height:30px;transform:rotate(-45deg);border:2px solid #fff;
               box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
               <span style="transform:rotate(45deg);font-size:13px;">🌸</span></div>`,
      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -32]
    });
    L.marker([SHOP_LAT, SHOP_LNG], { icon: shopIcon })
      .addTo(adminMap)
      .bindPopup('<strong>IHarbor Flower Shop</strong>');

    // Customer pin (red)
    const pinIcon = L.divIcon({
      className: '',
      html: `<div style="background:#e74c3c;color:#fff;border-radius:50% 50% 50% 0;
               width:34px;height:34px;transform:rotate(-45deg);border:3px solid #fff;
               box-shadow:0 2px 10px rgba(231,76,60,.5);display:flex;align-items:center;justify-content:center;">
               <span style="transform:rotate(45deg);font-size:15px;">📌</span></div>`,
      iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -36]
    });
    L.marker([lat, lng], { icon: pinIcon })
      .addTo(adminMap)
      .bindPopup(`<strong>Customer location</strong><br><small>${address || ''}</small>`)
      .openPopup();

    // Draw a dashed line from shop to customer
    L.polyline([[SHOP_LAT, SHOP_LNG], [lat, lng]], {
      color: '#27ae60', weight: 2, dashArray: '6, 6', opacity: .7
    }).addTo(adminMap);

    // Fit map to show both markers
    adminMap.fitBounds([[SHOP_LAT, SHOP_LNG], [lat, lng]], { padding: [40, 40] });
  }, 80);
};

window.closeAdminMap = function () {
  document.getElementById('admin-map-modal').classList.remove('show');
  document.body.style.overflow = 'auto';
  if (adminMap) { adminMap.remove(); adminMap = null; }
};

// Close on backdrop click
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('admin-map-modal').addEventListener('click', function (e) {
    if (e.target === this) closeAdminMap();
  });
});

// ─── Rendering ────────────────────────────────────────────────────────────────
function formatDate(firestoreTimestamp) {
  if (!firestoreTimestamp) return '—';
  // Firestore Timestamp objects have a .toDate() method
  const d = firestoreTimestamp.toDate ? firestoreTimestamp.toDate() : new Date(firestoreTimestamp);
  return d.toLocaleString('en-PH', {
    year:'numeric', month:'short', day:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

function statusClass(status) {
  switch (status) {
    case 'New':             return 'status-new';
    case 'Preparing':       return 'status-preparing';
    case 'Out for Delivery':return 'status-out';
    case 'Completed':       return 'status-completed';
    case 'Cancelled':       return 'status-cancelled';
    default:                return '';
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderOrders(orders) {
  _lastOrders = orders; // cache for printReceipt
  const listEl       = document.getElementById('orders-list');
  const totalRevenue = orders
    .filter(o => o.status !== 'Cancelled')
    .reduce((s, o) => s + (o.total || 0), 0);

  document.getElementById('summary-total-orders').textContent = orders.length;
  document.getElementById('summary-new-orders').textContent   = orders.filter(o => o.status === 'New').length;
  document.getElementById('summary-revenue').textContent      = '₱' + totalRevenue.toFixed(2);

  if (orders.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No orders yet.</p>';
    return;
  }

  listEl.innerHTML = orders.map(order => {
    const itemsHtml = (order.items || [])
      .map(i => `<li>${escapeHtml(i.name)} × ${i.quantity} — ₱${(i.price * i.quantity).toFixed(2)}</li>`)
      .join('');
    const itemsSubtotal = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);

    return `
      <div class="order-card">
        <div class="order-card-header">
          <div>
            <strong>${escapeHtml(order._id)}</strong>
            <span class="order-date">${formatDate(order.date)}</span>
          </div>
          <span class="status-badge ${statusClass(order.status)}">${escapeHtml(order.status)}</span>
        </div>

        <div class="order-card-body">
          <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
          ${order.hasOtherReceiver ? `<p><strong>Receiver:</strong> 🎁 ${escapeHtml(order.receiverName || '')} — ${escapeHtml(order.receiverPhone || '')}</p>` : ''}
          <p><strong>Delivery:</strong> ${escapeHtml(order.deliveryOption)}</p>
          ${order.deliveryAddress ? `<p><strong>Address:</strong> ${escapeHtml(order.deliveryAddress)}</p>` : ''}
          ${order.landmark ? `<p><strong>Landmark:</strong> 📍 ${escapeHtml(order.landmark)}</p>` : ''}
          ${order.deliveryDate ? `<p><strong>Preferred Date:</strong> 📅 ${escapeHtml(order.deliveryDate)}</p>` : ''}
          ${order.deliveryTime ? `<p><strong>Preferred Time:</strong> 🕐 ${escapeHtml(order.deliveryTime)}</p>` : ''}
          ${order.isSurprise ? `<p><strong>Surprise:</strong> 🎉 Yes${order.surpriseNote ? ` — ${escapeHtml(order.surpriseNote)}` : ''}</p>` : ''}
          <ul class="order-items">${itemsHtml}</ul>
          <p><strong>Items Subtotal:</strong> ₱${itemsSubtotal.toFixed(2)}</p>
          <div class="delivery-fee-control">
            <label for="fee-input-${order._id}">Delivery Fee ₱</label>
            <input type="number" id="fee-input-${order._id}" min="0" step="0.01"
              value="${(order.deliveryFee || 0).toFixed(2)}" />
            <button class="delivery-fee-save-btn"
              onclick="saveOrderDeliveryFee('${order._id}', document.getElementById('fee-input-${order._id}').value, ${itemsSubtotal})">Save</button>
            <span class="delivery-fee-status" id="fee-status-${order._id}"></span>
          </div>
          <p class="order-total"><strong>Total: ₱${(order.total || 0).toFixed(2)}</strong></p>
        </div>

        <div class="order-card-actions">
          <select onchange="updateOrderStatus('${order._id}', this.value)">
            ${['New','Preparing','Out for Delivery','Completed','Cancelled']
              .map(s => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`)
              .join('')}
          </select>
          ${order.pinLat != null && order.pinLng != null
            ? `<button class="map-pin-btn"
                 data-lat="${order.pinLat}"
                 data-lng="${order.pinLng}"
                 data-addr="${escapeHtml(order.deliveryAddress || '')}"
                 onclick="openAdminMap(+this.dataset.lat, +this.dataset.lng, this.dataset.addr)">📍 View Pin</button>`
            : `<span class="no-pin-label">No pin</span>`}
          <button class="danger-btn small-btn" onclick="deleteOrder('${order._id}')">Delete</button>
          <button class="print-receipt-btn" onclick="printReceipt('${order._id}')">🖨 Print Receipt</button>
        </div>
      </div>`;
  }).join('');
}
