// ─── Firebase Setup ───────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDBwDgss8kfJiYJMPRhma4kCPYdCyjvy58",
  authDomain: "iharbor-9a729.firebaseapp.com",
  projectId: "iharbor-9a729",
  storageBucket: "iharbor-9a729.firebasestorage.app",
  messagingSenderId: "549784101262",
  appId: "1:549784101262:web:42dbb5cc7a5e3e9f1504df",
  measurementId: "G-65T4KBFMLP"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── Auth State Listener ──────────────────────────────────────────────────────
// Runs every time the user logs in or out.
// Shows the auth wall or the shop depending on whether a user session exists.
onAuthStateChanged(auth, (user) => {
  if (user) {
    showShop(user);
  } else {
    showAuthWall();
  }
});

// ─── Auth Wall Visibility ─────────────────────────────────────────────────────
function showAuthWall() {
  document.getElementById('auth-wall').style.display    = 'flex';
  document.getElementById('shop-content').style.display = 'none';
  // Default to login tab
  switchAuthTab('login');
}

function showShop(user) {
  document.getElementById('auth-wall').style.display    = 'none';
  document.getElementById('shop-content').style.display = 'block';

  // Greet the logged-in user
  const displayName = user.displayName || user.email;
  const greetEl = document.getElementById('user-greeting');
  if (greetEl) greetEl.textContent = `Hi, ${displayName}`;

  // Init shop
  showCategory('bouquets');
  updateCartButton();
  startMyOrdersListener();
}

// ─── Tab Switcher (Login ↔ Sign Up) ──────────────────────────────────────────
function switchAuthTab(tab) {
  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const loginTab   = document.getElementById('tab-login');
  const signupTab  = document.getElementById('tab-signup');

  clearAuthError();

  if (tab === 'login') {
    loginForm.style.display  = 'flex';
    signupForm.style.display = 'none';
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
  } else {
    loginForm.style.display  = 'none';
    signupForm.style.display = 'flex';
    loginTab.classList.remove('active');
    signupTab.classList.add('active');
  }
}

// ─── Auth Error Display ───────────────────────────────────────────────────────
function showAuthError(message) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// Maps Firebase error codes to friendly messages
function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':            'Please enter a valid email address.',
    'auth/user-not-found':           'No account found with this email.',
    'auth/wrong-password':           'Incorrect password. Please try again.',
    'auth/email-already-in-use':     'An account with this email already exists.',
    'auth/weak-password':            'Password must be at least 6 characters.',
    'auth/too-many-requests':        'Too many attempts. Please try again later.',
    'auth/network-request-failed':   'Network error. Check your connection.',
    'auth/invalid-credential':       'Incorrect email or password.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  clearAuthError();

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');

  btn.disabled    = true;
  btn.textContent = 'Signing in…';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles the rest
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    btn.disabled    = false;
    btn.textContent = 'Sign In';
  }
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────
async function handleSignup(e) {
  e.preventDefault();
  clearAuthError();

  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm  = document.getElementById('signup-confirm').value;
  const btn      = document.getElementById('signup-btn');

  if (password !== confirm) {
    showAuthError('Passwords do not match.'); return;
  }
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.'); return;
  }

  btn.disabled    = true;
  btn.textContent = 'Creating account…';

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Save display name to the user profile
    await updateProfile(credential.user, { displayName: name });
    // onAuthStateChanged handles the rest
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    btn.disabled    = false;
    btn.textContent = 'Create Account';
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function handleLogout() {
  // Close any open modals first
  document.getElementById('cart-modal').style.display    = 'none';
  document.getElementById('orders-modal').style.display   = 'none';
  document.getElementById('checkout-form').style.display = 'none';
  document.getElementById('confirmation-section').style.display = 'none';
  document.body.style.overflow = 'auto';

  // Reset cart
  cart      = [];
  cartCount = 0;

  // Detach the live orders listener before signing out, otherwise Firestore
  // will throw a permission-denied error once the auth session ends.
  stopMyOrdersListener();

  await signOut(auth);
  // onAuthStateChanged handles showing the auth wall
}

// ─── Cart State ───────────────────────────────────────────────────────────────
let cart      = [];
let cartCount = 0;

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Auth form submissions
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('signup-form').addEventListener('submit', handleSignup);

  // Shop add-to-cart buttons
  document.querySelectorAll('.add-to-cart').forEach(button => {
    button.addEventListener('click', function () {
      addToCart(this.getAttribute('data-name'), this.getAttribute('data-price'));
    });
  });

  // Checkout form
  document.getElementById('customer-details-form').addEventListener('submit', function (e) {
    e.preventDefault();
    processCheckout();
  });
});

// ─── Category Toggle ──────────────────────────────────────────────────────────
function showCategory(category) {
  const bouquetsSection  = document.getElementById('bouquets-section');
  const souvenirsSection = document.getElementById('souvenirs-section');
  const buttons          = document.querySelectorAll('.category-buttons button');

  buttons.forEach(b => b.classList.remove('active'));

  if (category === 'bouquets') {
    bouquetsSection.style.display  = 'grid';
    souvenirsSection.style.display = 'none';
    buttons[0].classList.add('active');
  } else {
    bouquetsSection.style.display  = 'none';
    souvenirsSection.style.display = 'grid';
    buttons[1].classList.add('active');
  }
}

// ─── Cart Helpers ─────────────────────────────────────────────────────────────
function addToCart(name, price) {
  const existing = cart.find(i => i.name === name);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ name, price: parseFloat(price), quantity: 1 });
  }
  cartCount++;
  updateCartButton();
  showAddToCartMessage(name);
}

function showAddToCartMessage(itemName) {
  const msg = document.createElement('div');
  msg.textContent = `${itemName} added to cart!`;
  msg.style.cssText = `
    position:fixed;top:80px;right:20px;
    background:linear-gradient(135deg,#27ae60,#2ecc71);
    color:#fff;padding:12px 20px;border-radius:25px;
    z-index:1002;font-weight:600;
    box-shadow:0 4px 15px rgba(46,204,113,.3);
    font-size:.9rem;`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

// Keeps the hamburger-menu cart badge and the in-menu "Cart" count in sync.
function updateCartButton() {
  const badge     = document.getElementById('cart-count-badge');
  const menuCount = document.getElementById('menu-cart-count');

  if (menuCount) menuCount.textContent = cartCount;
  if (badge) {
    badge.textContent = cartCount;
    badge.classList.toggle('hidden', cartCount === 0);
  }
}

function toggleCart() {
  const modal     = document.getElementById('cart-modal');
  const isVisible = modal.style.display !== 'none';
  if (isVisible) {
    modal.style.display          = 'none';
    document.body.style.overflow = 'auto';
  } else {
    modal.style.display          = 'flex';
    document.body.style.overflow = 'hidden';
    updateCartDisplay();
  }
}

function updateCartDisplay() {
  const cartItems = document.getElementById('cart-items');
  cartItems.innerHTML = '';

  if (cart.length === 0) {
    cartItems.innerHTML = '<li style="text-align:center;color:#7f8c8d;font-style:italic;padding:20px;">Your cart is empty</li>';
    return;
  }

  let total = 0;
  cart.forEach((item, index) => {
    const li = document.createElement('li');
    li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:15px 0;border-bottom:1px solid #eee;';
    li.innerHTML = `
      <div style="flex:1;">
        <strong style="font-size:1.1rem;">${item.name}</strong><br>
        <span style="color:#7f8c8d;font-size:.9rem;">Qty: ${item.quantity} × ₱${item.price.toFixed(2)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:15px;">
        <span style="font-weight:bold;color:#e74c3c;font-size:1.1rem;">₱${(item.quantity * item.price).toFixed(2)}</span>
        <button onclick="removeFromCart(${index})" style="
          background:#e74c3c;color:#fff;border:none;padding:8px 12px;
          border-radius:15px;cursor:pointer;font-size:.8rem;">Remove</button>
      </div>`;
    cartItems.appendChild(li);
    total += item.quantity * item.price;
  });

  const totalLi = document.createElement('li');
  totalLi.style.cssText = 'border-top:2px solid #27ae60;margin-top:15px;padding-top:15px;font-weight:bold;font-size:1.3rem;display:flex;justify-content:space-between;align-items:center;';
  totalLi.innerHTML = `<div style="flex:1;">Total:</div><div style="color:#27ae60;">₱${total.toFixed(2)}</div>`;
  cartItems.appendChild(totalLi);
}

function removeFromCart(index) {
  cartCount -= cart[index].quantity;
  cart.splice(index, 1);
  updateCartButton();
  updateCartDisplay();
}

// ─── Checkout Flow ────────────────────────────────────────────────────────────
function checkout() {
  if (cart.length === 0) { alert('Your cart is empty!'); return; }
  document.getElementById('cart-modal').style.display    = 'none';
  document.getElementById('checkout-form').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function toggleAddressField() {
  const option  = document.getElementById('delivery-option').value;
  const wrapper = document.getElementById('address-field-wrapper');
  const input   = document.getElementById('delivery-address');
  if (option === 'delivery') {
    wrapper.style.display = 'block';
    input.required = true;
  } else {
    wrapper.style.display = 'none';
    input.required = false;
    input.value = '';
  }
}

function processCheckout() {
  const customerName   = document.getElementById('customer-name').value.trim();
  const customerPhone  = document.getElementById('customer-phone').value.trim();
  const deliveryOption = document.getElementById('delivery-option').value;
  const deliveryAddress = document.getElementById('delivery-address').value.trim();

  if (!customerName || !customerPhone || !deliveryOption) {
    alert('Please fill in all required fields.');
    return;
  }

  if (deliveryOption === 'delivery' && !deliveryAddress) {
    alert('Please enter your delivery address.');
    return;
  }

  // ── Fees removed: total is simply the sum of cart items, no extra
  //    charge added regardless of which delivery option is chosen. ──
  let total = cart.reduce((s, i) => s + i.quantity * i.price, 0);
  let deliveryText = '';

  switch (deliveryOption) {
    case 'pickup':   deliveryText = 'Pick Up';   break;
    case 'meetup':   deliveryText = 'Meet Up';   break;
    case 'delivery': deliveryText = 'Delivery';  break;
  }

  document.getElementById('customer-name-display').textContent   = customerName;
  document.getElementById('customer-phone-display').textContent  = customerPhone;
  document.getElementById('delivery-option-display').textContent = deliveryText;
  document.getElementById('total-price-display').textContent     = total.toFixed(2);

  // Show or hide address row in confirmation
  const addressRow = document.getElementById('address-display-row');
  const addressDisplay = document.getElementById('delivery-address-display');
  if (deliveryOption === 'delivery' && deliveryAddress) {
    addressDisplay.textContent = deliveryAddress;
    addressRow.style.display = 'block';
  } else {
    addressDisplay.textContent = '';
    addressRow.style.display = 'none';
  }

  document.getElementById('checkout-form').style.display        = 'none';
  document.getElementById('confirmation-section').style.display = 'flex';
}

// ─── Save Order to Firestore ──────────────────────────────────────────────────
async function recordOrder() {
  const user  = auth.currentUser;
  const order = {
    date:           serverTimestamp(),
    userId:         user ? user.uid   : null,    // ← links order to the account
    userEmail:      user ? user.email : null,
    customerName:   document.getElementById('customer-name-display').textContent,
    customerPhone:  document.getElementById('customer-phone-display').textContent,
    deliveryOption: document.getElementById('delivery-option-display').textContent,
    deliveryAddress: document.getElementById('delivery-address-display').textContent || null,
    total:          parseFloat(document.getElementById('total-price-display').textContent),
    items:          cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
    status:         'New'
  };

  try {
    await addDoc(collection(db, 'orders'), order);
  } catch (err) {
    console.error('Failed to save order to Firestore:', err);
  }
}

async function finishCheckout() {
  await recordOrder();

  cart      = [];
  cartCount = 0;
  updateCartButton();

  document.getElementById('customer-details-form').reset();
  document.getElementById('confirmation-section').style.display = 'none';
  document.body.style.overflow = 'auto';

  alert('Thank you for your order! We will contact you soon to confirm the details.');
}

function cancelCheckout() {
  document.getElementById('customer-details-form').reset();
  document.getElementById('checkout-form').style.display        = 'none';
  document.getElementById('confirmation-section').style.display = 'none';
  document.body.style.overflow = 'auto';
}

// ─── Orders ("My Orders") ──────────────────────────────────────────────────────
// Listens in real time to every order placed by the currently signed-in user
// (matched on userId). Because this uses onSnapshot instead of a one-time
// getDocs(), the moment an admin changes an order's status in the admin
// dashboard, this customer's "My Orders" list updates automatically —
// no refresh needed, even if the modal is already open.
let unsubscribeMyOrders = null;
let latestOrdersSnapshotData = []; // cached so reopening the modal is instant
let lastSeenStatusByOrderId = {};  // used to detect status changes for the "updated" indicator

function statusToClass(status) {
  return 'status-' + String(status || 'new')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function formatOrderDate(ts) {
  try {
    if (ts && typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
  } catch (_) { /* fall through */ }
  return 'Just now';
}

// Starts (or restarts) the live orders listener for the signed-in user.
// Safe to call multiple times — it detaches any existing listener first.
function startMyOrdersListener() {
  if (unsubscribeMyOrders) { unsubscribeMyOrders(); unsubscribeMyOrders = null; }

  const user = auth.currentUser;
  if (!user) return;

  const ordersRef = collection(db, 'orders');
  const q = query(
    ordersRef,
    where('userId', '==', user.uid),
    orderBy('date', 'desc')
  );

  unsubscribeMyOrders = onSnapshot(q, snapshot => {
    const orders = snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));

    // Detect any status change since the last snapshot to drive the
    // "Updated" badge on the My Orders menu item.
    let hasNewUpdate = false;
    orders.forEach(o => {
      const prevStatus = lastSeenStatusByOrderId[o._id];
      if (prevStatus !== undefined && prevStatus !== o.status) {
        hasNewUpdate = true;
      }
      lastSeenStatusByOrderId[o._id] = o.status;
    });

    latestOrdersSnapshotData = orders;
    renderMyOrders(orders);

    const ordersModal = document.getElementById('orders-modal');
    const modalOpen = ordersModal && ordersModal.style.display !== 'none';
    if (hasNewUpdate && !modalOpen) {
      showOrdersUpdatedIndicator();
    }
  }, err => {
    console.error('Failed to listen for orders:', err);
    const loadingMsg = document.getElementById('orders-loading-msg');
    const emptyMsg   = document.getElementById('orders-empty-msg');
    if (loadingMsg) loadingMsg.style.display = 'none';
    if (emptyMsg) {
      emptyMsg.textContent = 'Could not load your orders right now. Please try again later.';
      emptyMsg.style.display = 'block';
    }
  });
}

function stopMyOrdersListener() {
  if (unsubscribeMyOrders) { unsubscribeMyOrders(); unsubscribeMyOrders = null; }
  latestOrdersSnapshotData = [];
  lastSeenStatusByOrderId  = {};
  hideOrdersUpdatedIndicator();
}

function renderMyOrders(orders) {
  const loadingMsg = document.getElementById('orders-loading-msg');
  const emptyMsg   = document.getElementById('orders-empty-msg');
  const list       = document.getElementById('orders-list');
  if (!list) return;

  loadingMsg.style.display = 'none';
  list.innerHTML = '';

  if (orders.length === 0) {
    emptyMsg.style.display = 'block';
    list.style.display     = 'none';
    return;
  }

  emptyMsg.style.display = 'none';

  orders.forEach(order => {
    const itemsText = (order.items || [])
      .map(i => `${i.quantity}× ${i.name}`)
      .join(', ');
    const status = order.status || 'New';

    const li = document.createElement('li');
    li.className = 'order-card';
    li.innerHTML = `
      <div class="order-card-header">
        <span class="order-card-date">${formatOrderDate(order.date)}</span>
        <span class="status-pill ${statusToClass(status)}">${status}</span>
      </div>
      <div class="order-card-items">${itemsText || 'No items listed'}</div>
      <div class="order-card-footer">
        <span>${order.deliveryOption || ''}</span>
        <span class="order-card-total">₱${(order.total || 0).toFixed(2)}</span>
      </div>`;
    list.appendChild(li);
  });

  list.style.display = 'flex';
}

// Small dot shown on the "My Orders" menu item (and the hamburger icon)
// when a status changes while the customer isn't looking at the modal.
function showOrdersUpdatedIndicator() {
  const menuDot = document.getElementById('orders-update-dot');
  const menuBtnDot = document.getElementById('menu-update-dot');
  if (menuDot) menuDot.classList.remove('hidden');
  if (menuBtnDot) menuBtnDot.classList.remove('hidden');
}

function hideOrdersUpdatedIndicator() {
  const menuDot = document.getElementById('orders-update-dot');
  const menuBtnDot = document.getElementById('menu-update-dot');
  if (menuDot) menuDot.classList.add('hidden');
  if (menuBtnDot) menuBtnDot.classList.add('hidden');
}

function toggleOrders() {
  const modal     = document.getElementById('orders-modal');
  const isVisible = modal.style.display !== 'none';
  if (isVisible) {
    modal.style.display          = 'none';
    document.body.style.overflow = 'auto';
  } else {
    modal.style.display          = 'flex';
    document.body.style.overflow = 'hidden';
    hideOrdersUpdatedIndicator();

    // Listener is already running in the background (started at login),
    // so we already have data — just render whatever's cached immediately.
    const loadingMsg = document.getElementById('orders-loading-msg');
    if (latestOrdersSnapshotData.length > 0 || unsubscribeMyOrders) {
      renderMyOrders(latestOrdersSnapshotData);
    } else if (loadingMsg) {
      loadingMsg.style.display = 'block';
      startMyOrdersListener();
    }
  }
}

// ─── Expose globals used by inline onclick handlers ───────────────────────────
window.showCategory   = showCategory;
window.switchAuthTab  = switchAuthTab;
window.handleLogout   = handleLogout;
window.toggleCart     = toggleCart;
window.toggleOrders   = toggleOrders;
window.removeFromCart = removeFromCart;
window.checkout       = checkout;
window.finishCheckout = finishCheckout;
window.cancelCheckout = cancelCheckout;
window.toggleAddressField = toggleAddressField;