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

// ─── CSV Export ───────────────────────────────────────────────────────────────
window.exportOrdersCSV = async function () {
  const snapshot = await getDocs(query(collection(db, 'orders'), orderBy('date', 'desc')));
  const orders   = snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));

  if (orders.length === 0) { alert('No orders to export.'); return; }

  const headers = ['Order ID','Date','Customer Name','Phone','Delivery Option','Delivery Address','Items','Total','Status'];
  const rows = orders.map(o => [
    o._id,
    formatDate(o.date),
    o.customerName,
    o.customerPhone,
    o.deliveryOption,
    o.deliveryAddress || '',
    (o.items || []).map(i => `${i.name} x${i.quantity}`).join('; '),
    (o.total || 0).toFixed(2),
    o.status
  ]);

  const csv  = [headers, ...rows]
    .map(row => row.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `iharbor-orders-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

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
          <p><strong>Delivery:</strong> ${escapeHtml(order.deliveryOption)}</p>
          ${order.deliveryAddress ? `<p><strong>Address:</strong> ${escapeHtml(order.deliveryAddress)}</p>` : ''}
          <ul class="order-items">${itemsHtml}</ul>
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
        </div>
      </div>`;
  }).join('');
}