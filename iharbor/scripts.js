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
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
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
  loadCart();
  renderProductsFromFirestore();
  startMyOrdersListener();
}

// ─── Tab Switcher (Login ↔ Sign Up ↔ Forgot Password) ────────────────────────
function switchAuthTab(tab) {
  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-form');
  const loginTab   = document.getElementById('tab-login');
  const signupTab  = document.getElementById('tab-signup');

  clearAuthError();

  // Hide all forms first, then show the one requested
  loginForm.style.display  = 'none';
  signupForm.style.display = 'none';
  forgotForm.style.display = 'none';

  if (tab === 'login') {
    loginForm.style.display = 'flex';
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
  } else if (tab === 'signup') {
    signupForm.style.display = 'flex';
    loginTab.classList.remove('active');
    signupTab.classList.add('active');
  } else if (tab === 'forgot') {
    forgotForm.style.display = 'flex';
    loginTab.classList.remove('active');
    signupTab.classList.remove('active');
  }
}

// Shown when the user clicks "Forgot password?" on the login form
function showForgotPassword() {
  switchAuthTab('forgot');
}

// ─── Auth Error Display ───────────────────────────────────────────────────────
function showAuthError(message) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; el.style.color = ''; }
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

// ─── Forgot Password ──────────────────────────────────────────────────────────
async function handleForgotPassword(e) {
  e.preventDefault();
  clearAuthError();

  const email = document.getElementById('forgot-email').value.trim();
  const btn   = document.getElementById('forgot-btn');

  btn.disabled    = true;
  btn.textContent = 'Sending…';

  try {
    await sendPasswordResetEmail(auth, email);
    showAuthError('If an account exists for this email, a reset link has been sent. Please check your inbox (and spam folder).');
    document.getElementById('auth-error').style.color = '#2e7d4f';
  } catch (err) {
    document.getElementById('auth-error').style.color = '';
    showAuthError(friendlyAuthError(err.code));
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Send Reset Link';
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
  updateCartButton();

  // Detach the live orders listener before signing out, otherwise Firestore
  // will throw a permission-denied error once the auth session ends.
  stopMyOrdersListener();

  await signOut(auth);
  // onAuthStateChanged handles showing the auth wall
}

// ─── Cart State ───────────────────────────────────────────────────────────────
let cart      = [];
let cartCount = 0;

// ─── Persistent Cart (Firestore) ──────────────────────────────────────────────
// Cart is saved to carts/{userId} so it survives page refresh and tab close.

async function saveCart() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await setDoc(doc(db, 'carts', user.uid), {
      userId:    user.uid,
      items:     cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, notes: i.notes || '' })),
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Could not save cart:', err);
  }
}

async function loadCart() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, 'carts', user.uid));
    if (snap.exists()) {
      const saved = snap.data().items || [];
      cart      = saved.map(i => ({ name: i.name, price: parseFloat(i.price), quantity: i.quantity, notes: i.notes || '' }));
      cartCount = cart.reduce((s, i) => s + i.quantity, 0);
      updateCartButton();
    }
  } catch (err) {
    console.error('Could not load cart:', err);
  }
}

async function clearSavedCart() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await deleteDoc(doc(db, 'carts', user.uid));
  } catch (err) {
    console.error('Could not clear saved cart:', err);
  }
}

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Auth form submissions
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('signup-form').addEventListener('submit', handleSignup);
  document.getElementById('forgot-form').addEventListener('submit', handleForgotPassword);

  // Admin password modal — submit on Enter
  const pwInput = document.getElementById('admin-pw-input');
  if (pwInput) {
    pwInput.addEventListener('keyup', e => { if (e.key === 'Enter') submitAdminPassword(); });
  }

  // Shop add-to-cart buttons
  document.querySelectorAll('.add-to-cart').forEach(button => {
    button.addEventListener('click', function () {
      openQtyNotesModal(this.getAttribute('data-name'), this.getAttribute('data-price'));
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

// ─── Quantity & Notes Modal ───────────────────────────────────────────────────
let _qnPending = null;

function openQtyNotesModal(name, price) {
  _qnPending = { name, price: parseFloat(price) };
  document.getElementById('qn-product-name').textContent  = name;
  document.getElementById('qn-product-price').textContent = '\u20B1' + parseFloat(price).toFixed(2);
  document.getElementById('qn-qty-display').textContent   = '1';
  document.getElementById('qn-notes-input').value         = '';
  const modal = document.getElementById('qty-notes-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('qn-notes-input').focus(), 100);
}

function qnChangeQty(delta) {
  const el  = document.getElementById('qn-qty-display');
  const val = Math.max(1, parseInt(el.textContent) + delta);
  el.textContent = val;
}

function qnClose() {
  document.getElementById('qty-notes-modal').style.display = 'none';
  document.body.style.overflow = 'auto';
  _qnPending = null;
}

function qnConfirm() {
  if (!_qnPending) return;
  const qty   = parseInt(document.getElementById('qn-qty-display').textContent) || 1;
  const notes = document.getElementById('qn-notes-input').value.trim();
  addToCart(_qnPending.name, _qnPending.price, qty, notes);
  qnClose();
}

// ─── Cart Helpers ─────────────────────────────────────────────────────────────
function addToCart(name, price, qty, notes) {
  qty   = qty   || 1;
  notes = notes || '';
  const existing = cart.find(i => i.name === name && i.notes === notes);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ name, price: parseFloat(price), quantity: qty, notes });
  }
  cartCount += qty;
  updateCartButton();
  saveCart();
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
        ${item.notes ? `<br><span style="color:#27ae60;font-size:.82rem;font-style:italic;">📝 ${item.notes}</span>` : ''}
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
  saveCart();
  updateCartDisplay();
}

// ─── Checkout Flow ────────────────────────────────────────────────────────────
function checkout() {
  if (cart.length === 0) { alert('Your cart is empty!'); return; }
  document.getElementById('cart-modal').style.display    = 'none';
  document.getElementById('checkout-form').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Prevent picking a date in the past
  const dateInput = document.getElementById('delivery-date');
  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
  // Init (or refresh) the store locator map
  setTimeout(() => initStoreMap(), 100);
}

function toggleAddressField() {
  const option  = document.getElementById('delivery-option').value;
  const wrapper = document.getElementById('address-field-wrapper');
  const input   = document.getElementById('delivery-address');
  const useBtn  = document.getElementById('use-map-address-btn');

  if (option === 'delivery' || option === 'meetup') {
    wrapper.style.display = 'block';
    input.required = true;
    // Show "Use this location" button if a pin is already placed
    if (useBtn && pendingMapAddress) useBtn.style.display = 'block';
  } else {
    wrapper.style.display = 'none';
    input.required = false;
    input.value = '';
    if (useBtn) useBtn.style.display = 'none';
  }
}

function processCheckout() {
  const customerName   = document.getElementById('customer-name').value.trim();
  const customerPhone  = document.getElementById('customer-phone').value.trim();
  const deliveryOption = document.getElementById('delivery-option').value;
  const deliveryAddress = document.getElementById('delivery-address').value.trim();
  const deliveryDate    = document.getElementById('delivery-date').value;
  const deliveryTime    = document.getElementById('delivery-time').value;

  if (!customerName || !customerPhone || !deliveryOption) {
    alert('Please fill in all required fields.');
    return;
  }

  if (deliveryOption === 'delivery' && !deliveryAddress) {
    alert('Please enter your delivery address.');
    return;
  }

  if (!deliveryDate || !deliveryTime) {
    alert('Please select your preferred date and time.');
    return;
  }

  // Make sure the chosen date/time isn't in the past
  const chosenDateTime = new Date(`${deliveryDate}T${deliveryTime}`);
  if (chosenDateTime < new Date()) {
    alert('Please choose a date and time in the future.');
    return;
  }

  // ── No delivery fee at checkout: total is simply the sum of cart items.
  //    The admin adds a delivery fee afterward from the dashboard if needed. ──
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

  // Friendly formatted date/time for the confirmation screen
  const formattedDateTime = chosenDateTime.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  document.getElementById('delivery-datetime-display').textContent = formattedDateTime;
  // Stash raw values so recordOrder() can save them to Firestore
  pendingDeliveryDate = deliveryDate;
  pendingDeliveryTime = deliveryTime;

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
    deliveryDate:    pendingDeliveryDate || null,
    deliveryTime:    pendingDeliveryTime || null,
    pinLat:          pendingPinLat,
    pinLng:          pendingPinLng,
    total:          parseFloat(document.getElementById('total-price-display').textContent),
    items:          cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, notes: i.notes || '' })),
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
  pendingPinLat = null;
  pendingPinLng = null;
  pendingMapAddress = '';
  pendingDeliveryDate = '';
  pendingDeliveryTime = '';
  userPinMarker = null;
  storeMap = null;
  updateCartButton();
  clearSavedCart();

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
  pendingDeliveryDate = '';
  pendingDeliveryTime = '';
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

// Formats the customer's chosen delivery/pickup date + time (stored as
// separate "YYYY-MM-DD" / "HH:MM" strings) into a friendly display string.
function formatScheduledDateTime(dateStr, timeStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-PH', timeStr
      ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_) {
    return '';
  }
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
      .map(i => `${i.quantity}× ${i.name}${i.notes ? ` <em style="color:#27ae60;font-size:.82em;">(${i.notes})</em>` : ''}`)
      .join(', ');
    const status = order.status || 'New';
    const scheduledText = formatScheduledDateTime(order.deliveryDate, order.deliveryTime);

    const li = document.createElement('li');
    li.className = 'order-card';
    li.innerHTML = `
      <div class="order-card-header">
        <span class="order-card-date">${formatOrderDate(order.date)}</span>
        <span class="status-pill ${statusToClass(status)}">${status}</span>
      </div>
      <div class="order-card-items">${itemsText || 'No items listed'}</div>
      ${scheduledText ? `<div class="order-card-scheduled" style="font-size:.82rem;color:#27ae60;font-weight:600;margin-top:4px;">🗓️ ${scheduledText}</div>` : ''}
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
///10.678680896906389, 122.41151669177444
// ─── Store Locator (OpenStreetMap / Leaflet) ──────────────────────────────────
// IHarbor shop coordinates — update these to your actual store location
const STORE_LAT = 10.678680896906389;   // ← Cebu City, Philippines (example)
const STORE_LNG = 122.41151669177444;
const STORE_NAME = 'IHarbor Flower Shop';

let storeMap        = null;   // Leaflet map instance
let userPinMarker   = null;   // draggable marker for customer location
let pendingMapAddress = '';   // reverse-geocoded address from the pin
let pendingPinLat   = null;   // latitude of customer's map pin
let pendingPinLng   = null;   // longitude of customer's map pin
let pendingDeliveryDate = '';   // customer's chosen delivery/pickup date (YYYY-MM-DD)
let pendingDeliveryTime = '';   // customer's chosen delivery/pickup time (HH:MM)

function initStoreMap() {
  // Guard: if map already initialised, just invalidate size (fixes display after modal opens)
  if (storeMap) {
    setTimeout(() => storeMap.invalidateSize(), 200);
    return;
  }

  storeMap = L.map('store-map', { zoomControl: true }).setView([STORE_LAT, STORE_LNG], 15);

  // OpenStreetMap tile layer (free, no API key needed)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(storeMap);

  // Green shop marker
  const shopIcon = L.divIcon({
    className: '',
    html: `<div style="
      background:#27ae60;color:#fff;border-radius:50% 50% 50% 0;
      width:32px;height:32px;transform:rotate(-45deg);
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:14px;">🌸</span>
      </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34]
  });

  L.marker([STORE_LAT, STORE_LNG], { icon: shopIcon })
    .addTo(storeMap)
    .bindPopup(`<strong>${STORE_NAME}</strong><br>Tap anywhere on map<br>to set your location`)
    .openPopup();

  // Click-to-pin: place a draggable customer marker
  storeMap.on('click', function (e) {
    placeUserPin(e.latlng.lat, e.latlng.lng);
  });
}

function placeUserPin(lat, lng) {
  pendingPinLat = lat;
  pendingPinLng = lng;
  const redIcon = L.divIcon({
    className: '',
    html: `<div style="
      background:#e74c3c;color:#fff;border-radius:50% 50% 50% 0;
      width:28px;height:28px;transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:12px;">📌</span>
      </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30]
  });

  if (userPinMarker) {
    userPinMarker.setLatLng([lat, lng]);
  } else {
    userPinMarker = L.marker([lat, lng], { icon: redIcon, draggable: true }).addTo(storeMap);
    userPinMarker.on('dragend', function () {
      const pos = userPinMarker.getLatLng();
      pendingPinLat = pos.lat;
      pendingPinLng = pos.lng;
      reverseGeocode(pos.lat, pos.lng);
    });
  }

  reverseGeocode(lat, lng);
}

async function reverseGeocode(lat, lng) {
  const coordsEl = document.getElementById('map-coords-display');
  const useBtn   = document.getElementById('use-map-address-btn');

  if (coordsEl) coordsEl.textContent = 'Finding address…';
  if (useBtn)   useBtn.style.display = 'none';
  pendingMapAddress = '';

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();

    const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    pendingMapAddress = addr;

    if (coordsEl) coordsEl.textContent = `📍 ${addr}`;

    // Only show "Use this location" button when a location-based option is selected
    const deliveryOpt = document.getElementById('delivery-option').value;
    if (useBtn && (deliveryOpt === 'delivery' || deliveryOpt === 'meetup')) {
      useBtn.style.display = 'block';
    }

    if (userPinMarker) {
      userPinMarker.bindPopup(`<small>${addr}</small>`).openPopup();
    }
  } catch (err) {
    if (coordsEl) coordsEl.textContent = `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    pendingMapAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

function applyMapAddress() {
  if (!pendingMapAddress) return;
  const addrInput = document.getElementById('delivery-address');
  const wrapper   = document.getElementById('address-field-wrapper');
  if (addrInput) addrInput.value = pendingMapAddress;
  if (wrapper)   wrapper.style.display = 'block';
  document.getElementById('use-map-address-btn').style.display = 'none';
  document.getElementById('map-coords-display').textContent = '✅ Address copied to the field above!';
}

// ─── Admin: Product Management ────────────────────────────────────────────────
const ADMIN_PRODUCT_PASSWORD = 'iharbor2026'; // change this to your preferred password
let adminUnlocked = false;
let productsUnsubscribe = null;

// ── Password Modal ────────────────────────────────────────────────────────────
function openAdminPwModal() {
  document.getElementById('admin-pw-modal').style.display = 'flex';
  document.getElementById('admin-pw-input').value = '';
  document.getElementById('admin-pw-error').textContent = '';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('admin-pw-input').focus(), 100);
}

function closeAdminPwModal() {
  document.getElementById('admin-pw-modal').style.display = 'none';
  document.body.style.overflow = 'auto';
}

function submitAdminPassword() {
  const input = document.getElementById('admin-pw-input').value;
  if (input === ADMIN_PRODUCT_PASSWORD) {
    adminUnlocked = true;
    closeAdminPwModal();
    openAddItemModal();
  } else {
    document.getElementById('admin-pw-error').textContent = 'Incorrect password.';
    document.getElementById('admin-pw-input').value = '';
    document.getElementById('admin-pw-input').focus();
  }
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function openAddItemModal() {
  clearAddItemForm();
  document.getElementById('add-item-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  loadManageProductsList();
}

function closeAddItemModal() {
  document.getElementById('add-item-modal').style.display = 'none';
  document.body.style.overflow = 'auto';
  adminUnlocked = false;
}

function clearAddItemForm() {
  document.getElementById('edit-item-id').value  = '';
  document.getElementById('ai-name').value       = '';
  document.getElementById('ai-price').value      = '';
  document.getElementById('ai-category').value   = 'bouquets';
  document.getElementById('ai-image').value      = '';
  document.getElementById('add-item-error').textContent = '';
  document.getElementById('add-item-title').textContent = '➕ Add New Item';
}

// ── Save (Add or Update) ──────────────────────────────────────────────────────
async function saveItem() {
  const id       = document.getElementById('edit-item-id').value.trim();
  const name     = document.getElementById('ai-name').value.trim();
  const price    = parseFloat(document.getElementById('ai-price').value);
  const category = document.getElementById('ai-category').value;
  const image    = document.getElementById('ai-image').value.trim();
  const errEl    = document.getElementById('add-item-error');

  if (!name)           { errEl.textContent = 'Please enter a product name.'; return; }
  if (isNaN(price) || price < 0) { errEl.textContent = 'Please enter a valid price.'; return; }
  errEl.textContent = '';

  const data = { name, price, category, image: image || '', updatedAt: serverTimestamp() };

  try {
    if (id) {
      await setDoc(doc(db, 'products', id), data, { merge: true });
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'products'), data);
    }
    clearAddItemForm();
    loadManageProductsList();
    renderProductsFromFirestore(); // refresh shop display
  } catch (err) {
    console.error('Failed to save product:', err);
    errEl.textContent = 'Could not save. Please try again.';
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────────
function editItem(id, name, price, category, image) {
  document.getElementById('edit-item-id').value  = id;
  document.getElementById('ai-name').value       = name;
  document.getElementById('ai-price').value      = price;
  document.getElementById('ai-category').value   = category;
  document.getElementById('ai-image').value      = image || '';
  document.getElementById('add-item-title').textContent = '✏️ Edit Item';
  document.getElementById('ai-name').focus();
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteItem(id) {
  if (!confirm('Delete this product?')) return;
  try {
    await deleteDoc(doc(db, 'products', id));
    loadManageProductsList();
    renderProductsFromFirestore();
  } catch (err) {
    console.error('Failed to delete product:', err);
    alert('Could not delete product.');
  }
}

// ── List products inside the modal ───────────────────────────────────────────
async function loadManageProductsList() {
  const listEl = document.getElementById('manage-products-list');
  if (!listEl) return;
  listEl.innerHTML = '<li style="color:#7f8c8d;font-size:.85rem;">Loading…</li>';

  try {
    const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'asc')));
    if (snap.empty) {
      listEl.innerHTML = '<li style="color:#7f8c8d;font-size:.85rem;font-style:italic;">No products yet.</li>';
      return;
    }
    listEl.innerHTML = '';
    snap.forEach(d => {
      const p  = d.data();
      const li = document.createElement('li');
      li.className = 'manage-product-row';
      li.innerHTML = `
        <div class="mp-info">
          <div class="mp-name">${escHtml(p.name)}</div>
          <div class="mp-meta">₱${parseFloat(p.price).toFixed(2)} · ${escHtml(p.category)}</div>
        </div>
        <button class="mp-edit"  onclick="editItem('${d.id}','${escHtml(p.name)}',${p.price},'${p.category}','${escHtml(p.image||'')}')">Edit</button>
        <button class="mp-delete" onclick="deleteItem('${d.id}')">✕</button>`;
      listEl.appendChild(li);
    });
  } catch (err) {
    listEl.innerHTML = '<li style="color:#c0392b;font-size:.85rem;">Could not load products.</li>';
  }
}

// ── Render Firestore products into the shop sections ─────────────────────────
async function renderProductsFromFirestore() {
  try {
    const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'asc')));

    const bouquetsEl  = document.getElementById('bouquets-section');
    const souvenirsEl = document.getElementById('souvenirs-section');

    // Clear only dynamically-added items (those with data-dynamic="true")
    bouquetsEl.querySelectorAll('[data-dynamic]').forEach(el => el.remove());
    souvenirsEl.querySelectorAll('[data-dynamic]').forEach(el => el.remove());

    if (snap.empty) {
      const emptyMsg = '<p data-dynamic="true" style="color:#7f8c8d;font-style:italic;padding:20px 0;">No products yet — check back soon!</p>';
      bouquetsEl.innerHTML  = emptyMsg;
      souvenirsEl.innerHTML = emptyMsg;
      return;
    }

    snap.forEach(d => {
      const p       = d.data();
      const section = p.category === 'souvenirs' ? souvenirsEl : bouquetsEl;
      const div     = document.createElement('div');
      div.className    = 'product-item';
      div.dataset.dynamic = 'true';
      div.innerHTML = `
        ${p.image ? `<img src="${escHtml(p.image)}" alt="${escHtml(p.name)}" onerror="this.style.display='none'" />` : '<div style="height:120px;background:#f0faf4;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:2rem;">🌸</div>'}
        <p class="price">₱${parseFloat(p.price).toFixed(2)}</p>
        <p>${escHtml(p.name)}</p>
        <button class="add-to-cart" data-name="${escHtml(p.name)}" data-price="${p.price}">Add to Cart</button>`;
      // Wire up the add-to-cart button
      div.querySelector('.add-to-cart').addEventListener('click', function () {
        openQtyNotesModal(this.dataset.name, this.dataset.price);
      });
      section.appendChild(div);
    });
  } catch (err) {
    console.error('Could not load products from Firestore:', err);
  }
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── Expose globals used by inline onclick handlers ───────────────────────────
window.showCategory       = showCategory;
window.switchAuthTab      = switchAuthTab;
window.showForgotPassword = showForgotPassword;
window.handleLogout       = handleLogout;
window.toggleCart         = toggleCart;
window.toggleOrders       = toggleOrders;
window.removeFromCart     = removeFromCart;
window.checkout           = checkout;
window.finishCheckout     = finishCheckout;
window.cancelCheckout     = cancelCheckout;
window.toggleAddressField = toggleAddressField;
window.applyMapAddress    = applyMapAddress;
window.initStoreMap       = initStoreMap;
window.openAdminPwModal   = openAdminPwModal;
window.closeAdminPwModal  = closeAdminPwModal;
window.submitAdminPassword = submitAdminPassword;
window.closeAddItemModal  = closeAddItemModal;
window.saveItem           = saveItem;
window.editItem           = editItem;
window.deleteItem         = deleteItem;
window.openQtyNotesModal  = openQtyNotesModal;
window.qnChangeQty        = qnChangeQty;
window.qnClose            = qnClose;
window.qnConfirm          = qnConfirm;
