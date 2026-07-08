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
    const enteredShop = sessionStorage.getItem('iharbor_entered_shop') === '1';
    if (enteredShop) {
      showShop(user);
    } else {
      // First time this session — send them to the welcome/home page first.
      window.location.href = 'index.html';
    }
  } else {
    sessionStorage.removeItem('iharbor_entered_shop');
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

  // Clear any leftover values in the (now hidden) auth forms so Chrome
  // has nothing stale to "helpfully" carry over into other text fields
  // on the page (this was causing the email to appear in the product
  // search box on its own).
  ['login-email', 'login-password', 'forgot-email',
   'signup-name', 'signup-email', 'signup-password', 'signup-confirm']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

  // Greet the logged-in user
  const displayName = user.displayName || user.email;
  const greetEl = document.getElementById('user-greeting');
  if (greetEl) greetEl.textContent = `Hi, ${displayName}`;

  // Init shop
  showCategory('bouquets');
  loadCart();
  renderProductsFromFirestore().then(highlightProductFromHome);
  startMyOrdersListener();
  adjustSearchBarOffset();
  if (sessionStorage.getItem('iharbor_open_config_mode') === '1') {
    sessionStorage.removeItem('iharbor_open_config_mode');
    openAdminPwModal();
  }
}

// ─── Keep the sticky search bar clear of the top bar ──────────────────────────
function adjustSearchBarOffset() {
  const topbar        = document.getElementById('shop-topbar');
  const searchWrapper = document.getElementById('product-search-wrapper');
  if (!topbar || !searchWrapper) return;

  const style = getComputedStyle(topbar);
  if (style.position === 'fixed' || style.position === 'sticky') {
    // Topbar stays pinned on scroll too — stack the search bar right beneath it
    searchWrapper.style.top = topbar.offsetHeight + 'px';
  } else {
    // Topbar scrolls away normally — search bar can stick to the very top
    searchWrapper.style.top = '0px';
  }
}
window.addEventListener('resize', adjustSearchBarOffset);
window.addEventListener('load', adjustSearchBarOffset);

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
let cartItemIdCounter  = 0;        // gives each cart entry a stable id so selection survives re-renders
let selectedCartItemIds = new Set(); // ids of items the customer wants to include in checkout
let checkoutItems       = [];       // snapshot of selected items, captured when Checkout is clicked

// ─── Persistent Cart (Firestore) ──────────────────────────────────────────────
// Cart is saved to carts/{userId} so it survives page refresh and tab close.

async function saveCart() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await setDoc(doc(db, 'carts', user.uid), {
      userId:    user.uid,
      items:     cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, notes: i.notes || '', image: i.image || '', description: i.description || '' })),
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
      cart      = saved.map(i => ({ id: ++cartItemIdCounter, name: i.name, price: parseFloat(i.price), quantity: i.quantity, notes: i.notes || '', image: i.image || '', description: i.description || '' }));
      cartCount = cart.reduce((s, i) => s + i.quantity, 0);
      selectedCartItemIds = new Set(cart.map(i => i.id)); // select everything by default
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
      openQtyNotesModal(this.getAttribute('data-name'), this.getAttribute('data-price'), '', this.getAttribute('data-image') || '', this.getAttribute('data-description') || '');
    });
  });

  // Checkout form
  document.getElementById('customer-details-form').addEventListener('submit', function (e) {
    e.preventDefault();
    processCheckout();
  });
});

// ─── Category Toggle ──────────────────────────────────────────────────────────
let activeCategory = 'bouquets';

function showCategory(category) {
  activeCategory = category;

  const bouquetsSection  = document.getElementById('bouquets-section');
  const souvenirsSection = document.getElementById('souvenirs-section');
  const buttons          = document.querySelectorAll('.category-buttons button');

  // Switching category tabs clears any active product search
  const searchInput = document.getElementById('product-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  const noResultsEl = document.getElementById('search-no-results');
  if (noResultsEl) noResultsEl.style.display = 'none';
  bouquetsSection.querySelectorAll('.product-item').forEach(el => el.style.display = '');
  souvenirsSection.querySelectorAll('.product-item').forEach(el => el.style.display = '');

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

// ─── Product Search ───────────────────────────────────────────────────────────
function filterProducts(rawTerm) {
  const term            = (rawTerm || '').trim().toLowerCase();
  const bouquetsSection  = document.getElementById('bouquets-section');
  const souvenirsSection = document.getElementById('souvenirs-section');
  const buttons          = document.querySelectorAll('.category-buttons button');
  const clearBtn         = document.getElementById('search-clear-btn');
  const noResultsEl      = document.getElementById('search-no-results');

  if (!term) {
    // No search term: restore the normal single-category view
    if (clearBtn) clearBtn.classList.add('hidden');
    if (noResultsEl) noResultsEl.style.display = 'none';
    bouquetsSection.querySelectorAll('.product-item').forEach(el => el.style.display = '');
    souvenirsSection.querySelectorAll('.product-item').forEach(el => el.style.display = '');
    showCategoryDisplayOnly(activeCategory);
    return;
  }

  if (clearBtn) clearBtn.classList.remove('hidden');

  // While searching, show matching items from BOTH categories at once
  bouquetsSection.style.display  = 'grid';
  souvenirsSection.style.display = 'grid';
  buttons.forEach(b => b.classList.remove('active'));

  let matchCount = 0;
  [bouquetsSection, souvenirsSection].forEach(section => {
    section.querySelectorAll('.product-item').forEach(item => {
      const nameEl = item.querySelector('p:not(.price)');
      const name   = nameEl ? nameEl.textContent.toLowerCase() : '';
      const colors = (item.dataset.colors || '');
      const match  = name.includes(term) || colors.includes(term);
      item.style.display = match ? '' : 'none';
      if (match) matchCount++;
    });
  });

  if (noResultsEl) noResultsEl.style.display = matchCount === 0 ? 'block' : 'none';
}

// Helper: toggle section visibility for a category without touching the search box
function showCategoryDisplayOnly(category) {
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

function clearProductSearch() {
  const searchInput = document.getElementById('product-search-input');
  if (searchInput) searchInput.value = '';
  filterProducts('');
}

// ─── Quantity & Notes Modal ───────────────────────────────────────────────────
let _qnPending = null;

function openQtyNotesModal(name, price, prefillNotes, image, description) {
  _qnPending = { name, price: parseFloat(price), image: image || '', description: description || '' };
  document.getElementById('qn-product-name').textContent  = name;
  document.getElementById('qn-product-price').textContent = '\u20B1' + parseFloat(price).toFixed(2);
  document.getElementById('qn-qty-display').textContent   = '1';
  document.getElementById('qn-notes-input').value         = prefillNotes || '';
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
  addToCart(_qnPending.name, _qnPending.price, qty, notes, _qnPending.image, _qnPending.description);
  qnClose();
}

// ─── Add-ons Selection Modal (customer-facing) ────────────────────────────────
let _addonsForProduct   = null;        // { name, basePrice } of the product awaiting add-ons
let _availableAddons    = [];          // [{ id, name, price }] loaded fresh each time the modal opens
let _selectedAddonIds   = new Set();

async function openAddonsModal(name, price, color, image, description) {
  _addonsForProduct = { name, basePrice: parseFloat(price), color: color || '', image: image || '', description: description || '' };
  _selectedAddonIds = new Set();

  const listEl  = document.getElementById('addons-modal-list');
  const emptyEl = document.getElementById('addons-modal-empty');
  listEl.innerHTML = '<p style="text-align:center;color:#95a5a6;font-size:.9rem;padding:14px 0;">Loading add-ons…</p>';
  emptyEl.style.display = 'none';

  const modal = document.getElementById('addons-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  try {
    const snap = await getDocs(query(collection(db, 'addons'), orderBy('createdAt', 'asc')));
    _availableAddons = [];
    snap.forEach(d => {
      const a = d.data();
      _availableAddons.push({ id: d.id, name: a.name, price: parseFloat(a.price), image: a.image || '' });
    });

    if (_availableAddons.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
    } else {
      listEl.innerHTML = '';
      _availableAddons.forEach(a => {
        const row = document.createElement('label');
        row.className = 'addon-row';
        row.innerHTML = `
          <input type="checkbox" data-addon-id="${a.id}" />
          ${a.image ? `<img src="${escHtml(a.image)}" alt="${escHtml(a.name)}" class="addon-row-thumb" onerror="this.style.display='none'" />` : ''}
          <span class="addon-row-name">${escHtml(a.name)}</span>
          <span class="addon-row-price">+₱${a.price.toFixed(2)}</span>`;
        row.querySelector('input').addEventListener('change', function () {
          if (this.checked) _selectedAddonIds.add(a.id);
          else _selectedAddonIds.delete(a.id);
          updateAddonsModalTotal();
        });
        listEl.appendChild(row);
      });
    }
    updateAddonsModalTotal();
  } catch (err) {
    console.error('Could not load add-ons:', err);
    listEl.innerHTML = '<p style="text-align:center;color:#c0392b;font-size:.9rem;">Could not load add-ons.</p>';
  }
}

function updateAddonsModalTotal() {
  const total = _availableAddons
    .filter(a => _selectedAddonIds.has(a.id))
    .reduce((sum, a) => sum + a.price, 0);
  document.getElementById('addons-modal-total').textContent = 'Selected: \u20B1' + total.toFixed(2);
}

function closeAddonsModal() {
  document.getElementById('addons-modal').style.display = 'none';
  document.body.style.overflow = 'auto';
  _addonsForProduct = null;
  _selectedAddonIds = new Set();
}

function addonsModalContinue() {
  if (!_addonsForProduct) return;
  const selected = _availableAddons.filter(a => _selectedAddonIds.has(a.id));
  const addonsTotal = selected.reduce((sum, a) => sum + a.price, 0);
  const totalPrice  = _addonsForProduct.basePrice + addonsTotal;

  const noteParts = [];
  if (_addonsForProduct.color) noteParts.push(`Color: ${_addonsForProduct.color}`);
  if (selected.length) noteParts.push('Add-ons: ' + selected.map(a => `${a.name} (+₱${a.price.toFixed(2)})`).join(', '));
  const prefillNotes = noteParts.join(' | ');

  const { name, image, description } = _addonsForProduct;
  closeAddonsModal();
  openQtyNotesModal(name, totalPrice, prefillNotes, image, description);
}

function addonsModalSkip() {
  if (!_addonsForProduct) return;
  const { name, basePrice, color, image, description } = _addonsForProduct;
  closeAddonsModal();
  openQtyNotesModal(name, basePrice, color ? `Color: ${color}` : '', image, description);
}

// ─── Cart Helpers ─────────────────────────────────────────────────────────────
function addToCart(name, price, qty, notes, image, description) {
  qty   = qty   || 1;
  notes = notes || '';
  image = image || '';
  description = description || '';
  const existing = cart.find(i => i.name === name && i.notes === notes);
  if (existing) {
    existing.quantity += qty;
    if (!existing.image && image) existing.image = image;
    if (!existing.description && description) existing.description = description;
  } else {
    const newItem = { id: ++cartItemIdCounter, name, price: parseFloat(price), quantity: qty, notes, image, description };
    cart.push(newItem);
    selectedCartItemIds.add(newItem.id); // newly added items are selected by default
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

  // Drop ids for items that no longer exist in the cart (e.g. after Remove).
  // Note: we don't auto-(re)select items here — that would override a
  // deliberate uncheck on every re-render. New items are already selected
  // at the point they're added (see addToCart / loadCart).
  const currentIds = new Set(cart.map(i => i.id));
  Array.from(selectedCartItemIds).forEach(id => {
    if (!currentIds.has(id)) selectedCartItemIds.delete(id);
  });

  if (cart.length === 0) {
    cartItems.innerHTML = '<li style="text-align:center;color:#7f8c8d;font-style:italic;padding:20px;">Your cart is empty</li>';
    return;
  }

  // "Select All" row
  const allSelected = cart.every(i => selectedCartItemIds.has(i.id));
  const selectAllLi = document.createElement('li');
  selectAllLi.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #eee;';
  selectAllLi.innerHTML = `
    <input type="checkbox" id="cart-select-all" ${allSelected ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;flex-shrink:0;" />
    <label for="cart-select-all" style="font-weight:600;color:#2c3e50;cursor:pointer;font-size:.95rem;">Select All</label>`;
  cartItems.appendChild(selectAllLi);
  selectAllLi.querySelector('#cart-select-all').addEventListener('change', function () {
    if (this.checked) {
      cart.forEach(i => selectedCartItemIds.add(i.id));
    } else {
      selectedCartItemIds.clear();
    }
    updateCartDisplay();
  });

  let total = 0;
  cart.forEach((item, index) => {
    const checked = selectedCartItemIds.has(item.id);
    const li = document.createElement('li');
    li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:15px 0;border-bottom:1px solid #eee;gap:12px;';
    li.innerHTML = `
      <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${checked ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;cursor:pointer;" />
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
    if (checked) total += item.quantity * item.price;

    li.querySelector('.cart-item-checkbox').addEventListener('change', function () {
      const id = parseInt(this.dataset.id, 10);
      if (this.checked) selectedCartItemIds.add(id); else selectedCartItemIds.delete(id);
      updateCartDisplay();
    });
  });

  const totalLi = document.createElement('li');
  totalLi.style.cssText = 'border-top:2px solid #27ae60;margin-top:15px;padding-top:15px;font-weight:bold;font-size:1.3rem;display:flex;justify-content:space-between;align-items:center;';
  totalLi.innerHTML = `<div style="flex:1;">Selected Total:</div><div style="color:#27ae60;">₱${total.toFixed(2)}</div>`;
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

  checkoutItems = cart.filter(i => selectedCartItemIds.has(i.id));
  if (checkoutItems.length === 0) {
    alert('Please select at least one item to checkout.');
    return;
  }

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

function toggleSurpriseNote() {
  const isSurprise = document.getElementById('is-surprise').value === 'yes';
  const wrapper     = document.getElementById('surprise-note-wrapper');
  if (wrapper) wrapper.style.display = isSurprise ? 'block' : 'none';
  if (!isSurprise) {
    const noteInput = document.getElementById('surprise-note');
    if (noteInput) noteInput.value = '';
  }
}

function toggleOtherReceiver() {
  const checked = document.getElementById('other-receiver-checkbox').checked;
  const wrapper = document.getElementById('other-receiver-wrapper');
  if (wrapper) wrapper.style.display = checked ? 'block' : 'none';
  if (!checked) {
    const nameInput  = document.getElementById('receiver-name');
    const phoneInput = document.getElementById('receiver-phone');
    if (nameInput)  nameInput.value  = '';
    if (phoneInput) phoneInput.value = '';
  }
}

function processCheckout() {
  const customerName   = document.getElementById('customer-name').value.trim();
  const customerPhone  = document.getElementById('customer-phone').value.trim();
  const deliveryOption = document.getElementById('delivery-option').value;
  const deliveryAddress = document.getElementById('delivery-address').value.trim();
  const deliveryLandmark = document.getElementById('delivery-landmark').value.trim();
  const deliveryDate    = document.getElementById('delivery-date').value;
  const deliveryTime    = document.getElementById('delivery-time').value;
  const isSurprise      = document.getElementById('is-surprise').value === 'yes';
  const surpriseNote    = document.getElementById('surprise-note').value.trim();
  const hasOtherReceiver = document.getElementById('other-receiver-checkbox').checked;
  const receiverName     = document.getElementById('receiver-name').value.trim();
  const receiverPhone    = document.getElementById('receiver-phone').value.trim();

  if (!customerName || !customerPhone || !deliveryOption) {
    alert('Please fill in all required fields.');
    return;
  }

  if (hasOtherReceiver && (!receiverName || !receiverPhone)) {
    alert("Please enter the receiver's name and phone number.");
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

  // ── No delivery fee at checkout: total is the sum of the selected items.
  //    The admin adds a delivery fee afterward from the dashboard if needed. ──
  let total = checkoutItems.reduce((s, i) => s + i.quantity * i.price, 0);
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
  pendingLandmark     = deliveryLandmark;
  pendingIsSurprise   = isSurprise;
  pendingSurpriseNote = isSurprise ? surpriseNote : '';
  pendingHasOtherReceiver = hasOtherReceiver;
  pendingReceiverName     = hasOtherReceiver ? receiverName  : '';
  pendingReceiverPhone    = hasOtherReceiver ? receiverPhone : '';

  // Show or hide receiver row in confirmation
  const receiverRow = document.getElementById('receiver-display-row');
  const receiverNameDisplay  = document.getElementById('receiver-name-display');
  const receiverPhoneDisplay = document.getElementById('receiver-phone-display');
  if (hasOtherReceiver) {
    receiverNameDisplay.textContent  = receiverName;
    receiverPhoneDisplay.textContent = receiverPhone;
    receiverRow.style.display = 'block';
  } else {
    receiverNameDisplay.textContent  = '';
    receiverPhoneDisplay.textContent = '';
    receiverRow.style.display = 'none';
  }

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

  // Show or hide landmark row in confirmation
  const landmarkRow = document.getElementById('landmark-display-row');
  const landmarkDisplay = document.getElementById('delivery-landmark-display');
  if ((deliveryOption === 'delivery' || deliveryOption === 'meetup') && deliveryLandmark) {
    landmarkDisplay.textContent = deliveryLandmark;
    landmarkRow.style.display = 'block';
  } else {
    landmarkDisplay.textContent = '';
    landmarkRow.style.display = 'none';
  }

  // Show or hide surprise row in confirmation
  const surpriseRow = document.getElementById('surprise-display-row');
  const surpriseDisplay = document.getElementById('surprise-display');
  if (isSurprise) {
    surpriseDisplay.textContent = surpriseNote ? `Yes 🎉 — ${surpriseNote}` : 'Yes 🎉';
    surpriseRow.style.display = 'block';
  } else {
    surpriseDisplay.textContent = '';
    surpriseRow.style.display = 'none';
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
    landmark:        pendingLandmark || null,
    deliveryDate:    pendingDeliveryDate || null,
    deliveryTime:    pendingDeliveryTime || null,
    isSurprise:      pendingIsSurprise || false,
    surpriseNote:    pendingSurpriseNote || null,
    hasOtherReceiver: pendingHasOtherReceiver || false,
    receiverName:     pendingHasOtherReceiver ? (pendingReceiverName || null)  : null,
    receiverPhone:    pendingHasOtherReceiver ? (pendingReceiverPhone || null) : null,
    pinLat:          pendingPinLat,
    pinLng:          pendingPinLng,
    total:          parseFloat(document.getElementById('total-price-display').textContent),
    items:          checkoutItems.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, notes: i.notes || '', image: i.image || '', description: i.description || '' })),
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

  // Remove only the items that were checked out — anything the customer
  // left unchecked stays in the cart for next time.
  const checkedOutIds = new Set(checkoutItems.map(i => i.id));
  cart      = cart.filter(i => !checkedOutIds.has(i.id));
  cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  selectedCartItemIds = new Set(cart.map(i => i.id)); // keep remaining items selected by default
  checkoutItems = [];

  pendingPinLat = null;
  pendingPinLng = null;
  pendingMapAddress = '';
  pendingDeliveryDate = '';
  pendingDeliveryTime = '';
  pendingLandmark     = '';
  pendingIsSurprise   = false;
  pendingSurpriseNote = '';
  pendingHasOtherReceiver = false;
  pendingReceiverName     = '';
  pendingReceiverPhone    = '';
  userPinMarker = null;
  storeMap = null;
  updateCartButton();

  // Persist whatever's left in the cart, or clear it if nothing remains
  if (cart.length > 0) {
    await saveCart();
  } else {
    await clearSavedCart();
  }

  document.getElementById('customer-details-form').reset();
  document.getElementById('surprise-note-wrapper').style.display = 'none';
  document.getElementById('confirmation-section').style.display = 'none';
  document.body.style.overflow = 'auto';

  alert('Thank you for your order! We will contact you soon to confirm the details.');

  // Reload so the shop starts fresh (empty cart view, reset scroll, etc.)
  // once the customer has acknowledged the confirmation message.
  window.location.reload();
}

function cancelCheckout() {
  document.getElementById('customer-details-form').reset();
  document.getElementById('surprise-note-wrapper').style.display = 'none';
  document.getElementById('other-receiver-wrapper').style.display = 'none';
  document.getElementById('checkout-form').style.display        = 'none';
  document.getElementById('confirmation-section').style.display = 'none';
  document.body.style.overflow = 'auto';
  pendingDeliveryDate = '';
  pendingDeliveryTime = '';
  pendingLandmark     = '';
  pendingIsSurprise   = false;
  pendingSurpriseNote = '';
  pendingHasOtherReceiver = false;
  pendingReceiverName     = '';
  pendingReceiverPhone    = '';
  checkoutItems = [];
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
let lastSeenFeeByOrderId    = {};  // used to detect delivery-fee changes for the "updated" indicator

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

    // Detect any status OR delivery-fee change since the last snapshot to
    // drive the "Updated" badge on the My Orders menu item, and build a
    // human-readable message describing exactly what changed.
    let hasNewUpdate = false;
    const changeMessages = [];
    orders.forEach(o => {
      const prevStatus = lastSeenStatusByOrderId[o._id];
      if (prevStatus !== undefined && prevStatus !== o.status) {
        hasNewUpdate = true;
        changeMessages.push(`Your order status changed to "${o.status}"`);
      }
      lastSeenStatusByOrderId[o._id] = o.status;

      const prevFee = lastSeenFeeByOrderId[o._id];
      const currFee = o.deliveryFee || 0;
      if (prevFee !== undefined && prevFee !== currFee) {
        hasNewUpdate = true;
        changeMessages.push('Delivery fee changed on your order');
      }
      lastSeenFeeByOrderId[o._id] = currFee;
    });

    latestOrdersSnapshotData = orders;
    renderMyOrders(orders);

    const ordersModal = document.getElementById('orders-modal');
    const modalOpen = ordersModal && ordersModal.style.display !== 'none';
    if (hasNewUpdate && !modalOpen) {
      showOrdersUpdatedIndicator();
      // Show right away (anchored below the burger menu) rather than
      // waiting for the customer to open the menu.
      changeMessages.forEach((msg, idx) => {
        setTimeout(() => showOrderToast(msg), idx * 350);
      });
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
  lastSeenFeeByOrderId     = {};
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

// ─── Order-change toast ───────────────────────────────────────────────────────
// A small floating banner that tells the customer exactly what changed
// ("Delivery fee changed on your order" / "Your order status changed to ...").
// Appears right away, anchored just below the burger-menu button.
// Built entirely in JS so no HTML/CSS file edits are needed.
let _orderToastContainer  = null;

function getOrderToastContainer() {
  if (_orderToastContainer && document.body.contains(_orderToastContainer)) {
    return _orderToastContainer;
  }
  const container = document.createElement('div');
  container.id = 'order-toast-container';
  container.style.cssText = `
    position: fixed;
    z-index: 5000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    pointer-events: none;
  `;
  document.body.appendChild(container);
  _orderToastContainer = container;
  return container;
}

// Positions the toast container just under the burger-menu button itself,
// right-aligned with it, recalculated each time we show a toast so it
// stays correct even if the page has scrolled or resized.
function positionOrderToastContainer(container) {
  const menuBtn = document.getElementById('menu-toggle-btn');
  if (!menuBtn) return;
  const rect = menuBtn.getBoundingClientRect();
  container.style.top   = (rect.bottom + 8) + 'px';
  container.style.right = (window.innerWidth - rect.right) + 'px';
  container.style.left  = 'auto';
}

function showOrderToast(message) {
  const container = getOrderToastContainer();
  positionOrderToastContainer(container);

  const toast = document.createElement('div');
  toast.textContent = '🔔 ' + message;
  toast.className = 'order-toast';
  toast.style.cssText = `
    background: #1a5e36;
    color: #fff;
    padding: 10px 18px;
    border-radius: 20px;
    font-size: .85rem;
    font-weight: 600;
    box-shadow: 0 6px 18px rgba(0,0,0,.2);
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity .25s ease, transform .25s ease;
    max-width: min(90vw, 280px);
    text-align: center;
  `;
  container.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateY(0)';
  });
  // No auto-timeout here — the toast stays put until the customer clicks
  // the burger menu, at which point dismissOrderToasts() fades it out.
}

// Fades out and removes any order-change toasts currently on screen.
// Called from shop.html the moment the burger menu button is clicked.
function dismissOrderToasts() {
  const container = _orderToastContainer;
  if (!container) return;
  const toasts = container.querySelectorAll('.order-toast');
  toasts.forEach(toast => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 300);
  });
}
window.dismissOrderToasts = dismissOrderToasts;


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
let pendingLandmark     = '';   // nearby landmark to help find the address
let pendingIsSurprise   = false; // whether the order is a surprise for the recipient
let pendingSurpriseNote = '';   // special instructions for surprise deliveries
let pendingHasOtherReceiver = false; // whether the order is being placed for someone else
let pendingReceiverName     = ''; // other receiver's name
let pendingReceiverPhone    = ''; // other receiver's phone number

function initStoreMap() {
  // Guard: if map already initialised, just invalidate size (fixes display after modal opens)
  if (storeMap) {
    setTimeout(() => storeMap.invalidateSize(), 200);
    return;
  }

  storeMap = L.map('store-map', { zoomControl: true }).setView([STORE_LAT, STORE_LNG], 15);
  initMapSearchListeners();

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

// ─── Store Locator: Search Box (forward geocoding) ───────────────────────────
// Lets the customer type an address/place name and jump straight to it on
// the map, instead of having to hunt for it manually.
let mapSearchDebounceTimer = null;

function initMapSearchListeners() {
  const input = document.getElementById('map-search-input');
  if (!input || input.dataset.wired) return;
  input.dataset.wired = 'true';

  input.addEventListener('input', () => {
    clearTimeout(mapSearchDebounceTimer);
    const val = input.value.trim();
    if (val.length < 3) { hideMapSearchResults(); return; }
    mapSearchDebounceTimer = setTimeout(() => searchMapLocation(val, true), 450);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(mapSearchDebounceTimer);
      searchMapLocation(input.value.trim(), false);
    }
  });

  // Close the results dropdown when clicking elsewhere
  document.addEventListener('click', e => {
    const wrapper = document.getElementById('map-search-wrapper');
    if (wrapper && !wrapper.contains(e.target)) hideMapSearchResults();
  });
}

async function searchMapLocation(queryText, isAutocomplete) {
  const input = document.getElementById('map-search-input');
  const q = queryText !== undefined ? queryText : (input ? input.value.trim() : '');
  if (!q) return;

  const resultsEl = document.getElementById('map-search-results');
  if (resultsEl) {
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<li class="msr-status">Searching…</li>';
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&countrycodes=ph`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();

    if (!resultsEl) return;

    if (!data.length) {
      resultsEl.innerHTML = '<li class="msr-status">No matches found.</li>';
      return;
    }

    resultsEl.innerHTML = '';
    data.forEach(place => {
      const li = document.createElement('li');
      li.textContent = place.display_name;
      li.addEventListener('click', () => selectMapSearchResult(place));
      resultsEl.appendChild(li);
    });

    // If the customer pressed Enter (rather than just typing), jump straight
    // to the top match instead of making them click it.
    if (!isAutocomplete) selectMapSearchResult(data[0]);
  } catch (err) {
    if (resultsEl) resultsEl.innerHTML = '<li class="msr-status">Search failed. Please try again.</li>';
  }
}

function selectMapSearchResult(place) {
  const lat = parseFloat(place.lat);
  const lng = parseFloat(place.lon);
  if (!storeMap || isNaN(lat) || isNaN(lng)) return;

  storeMap.setView([lat, lng], 17);
  placeUserPin(lat, lng); // drops the pin and fills in the address, same as clicking the map

  const input = document.getElementById('map-search-input');
  if (input) input.value = place.display_name;

  hideMapSearchResults();
}

function hideMapSearchResults() {
  const resultsEl = document.getElementById('map-search-results');
  if (resultsEl) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; }
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
  clearAddonForm();
  switchManageTab('products');
  document.getElementById('add-item-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  loadManageProductsList();
}

function closeAddItemModal() {
  document.getElementById('add-item-modal').style.display = 'none';
  document.body.style.overflow = 'auto';
  adminUnlocked = false;
}

// ── Products / Add-ons tab switcher ────────────────────────────────────────────
function switchManageTab(tab) {
  const productsPanel = document.getElementById('manage-products-panel');
  const addonsPanel   = document.getElementById('manage-addons-panel');
  const productsTab   = document.getElementById('manage-tab-products');
  const addonsTab     = document.getElementById('manage-tab-addons');

  const activeStyle   = 'flex:1;padding:10px;border-radius:10px;border:1.5px solid #27ae60;background:#27ae60;color:#fff;font-weight:700;cursor:pointer;';
  const inactiveStyle = 'flex:1;padding:10px;border-radius:10px;border:1.5px solid #27ae60;background:#fff;color:#27ae60;font-weight:700;cursor:pointer;';

  if (tab === 'addons') {
    productsPanel.style.display = 'none';
    addonsPanel.style.display   = 'block';
    productsTab.setAttribute('style', inactiveStyle);
    addonsTab.setAttribute('style', activeStyle);
    loadManageAddonsList();
  } else {
    productsPanel.style.display = 'block';
    addonsPanel.style.display   = 'none';
    productsTab.setAttribute('style', activeStyle);
    addonsTab.setAttribute('style', inactiveStyle);
  }
}

function clearAddItemForm() {
  document.getElementById('edit-item-id').value  = '';
  document.getElementById('ai-name').value       = '';
  document.getElementById('ai-price').value      = '';
  document.getElementById('ai-category').value   = 'bouquets';
  document.getElementById('ai-image').value      = '';
  document.getElementById('ai-description').value = '';
  document.getElementById('ai-colors-list').innerHTML = '';
  document.getElementById('add-item-error').textContent = '';
  document.getElementById('add-item-title').textContent = '➕ Add New Item';
}

// ── Color Variants editor (Add/Edit Item form) ─────────────────────────────
// Each row lets the editor name a color (e.g. "Blue") and give it its own
// product photo. On the storefront, picking that color swaps the product
// image to this photo.
function addColorRow(name = '', image = '') {
  const list = document.getElementById('ai-colors-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'ai-color-row';
  row.innerHTML = `
    <input type="text" class="ai-color-name" placeholder="Color name (e.g. Blue)" />
    <input type="text" class="ai-color-image" placeholder="Image URL for this color" />
    <button type="button" class="ai-color-remove" title="Remove this color">✕</button>`;
  row.querySelector('.ai-color-name').value  = name;
  row.querySelector('.ai-color-image').value = image;
  row.querySelector('.ai-color-remove').addEventListener('click', function () {
    row.remove();
  });
  list.appendChild(row);
}

function collectColorVariants() {
  const rows = document.querySelectorAll('#ai-colors-list .ai-color-row');
  const colors = [];
  rows.forEach(row => {
    const name  = row.querySelector('.ai-color-name').value.trim();
    const image = row.querySelector('.ai-color-image').value.trim();
    if (name) colors.push({ name, image });
  });
  return colors;
}

// ── Save (Add or Update) ──────────────────────────────────────────────────────
async function saveItem() {
  const id       = document.getElementById('edit-item-id').value.trim();
  const name     = document.getElementById('ai-name').value.trim();
  const price    = parseFloat(document.getElementById('ai-price').value);
  const category = document.getElementById('ai-category').value;
  const image    = document.getElementById('ai-image').value.trim();
  const description = document.getElementById('ai-description').value.trim();
  const errEl    = document.getElementById('add-item-error');

  if (!name)           { errEl.textContent = 'Please enter a product name.'; return; }
  if (isNaN(price) || price < 0) { errEl.textContent = 'Please enter a valid price.'; return; }
  errEl.textContent = '';

  const colors = collectColorVariants();

  const data = { name, price, category, image: image || '', colors, description: description || '', updatedAt: serverTimestamp() };

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
let productsCache = {}; // id -> product data, populated when the admin list loads

function editItem(id) {
  const p = productsCache[id];
  if (!p) return;
  document.getElementById('edit-item-id').value  = id;
  document.getElementById('ai-name').value       = p.name || '';
  document.getElementById('ai-price').value      = p.price;
  document.getElementById('ai-category').value   = p.category || 'bouquets';
  document.getElementById('ai-image').value      = p.image || '';
  document.getElementById('ai-colors-list').innerHTML = '';
  (p.colors || []).forEach(c => addColorRow(c.name, c.image));
  document.getElementById('ai-description').value = p.description || '';
  document.getElementById('add-item-title').textContent = '✏️ Edit Item';
  document.getElementById('ai-name').focus();
}

// ── Toggle "featured" flag — controls what shows in Fresh Picks on home.html ──
async function toggleFeatured(id, current) {
  try {
    await setDoc(doc(db, 'products', id), { featured: !current }, { merge: true });
    loadManageProductsList();
  } catch (err) {
    console.error('Failed to update featured flag:', err);
    alert('Could not update Fresh Picks selection.');
  }
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

  // Reset any previous search filter so the freshly-loaded list starts unfiltered
  const searchInput = document.getElementById('mp-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('mp-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
  const noResultsEl = document.getElementById('mp-search-no-results');
  if (noResultsEl) noResultsEl.style.display = 'none';

  try {
    const snap = await getDocs(collection(db, 'products'));
    const docs = snap.docs.slice().sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
      const bTime = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
      return aTime - bTime;
    });
    if (docs.length === 0) {
      listEl.innerHTML = '<li style="color:#7f8c8d;font-size:.85rem;font-style:italic;">No products yet.</li>';
      return;
    }
    listEl.innerHTML = '';
    productsCache = {};
    docs.forEach(d => {
      const p  = d.data();
      productsCache[d.id] = p;
      const li = document.createElement('li');
      li.className = 'manage-product-row';
      li.dataset.searchName = (p.name || '').toLowerCase();
      li.innerHTML = `
        <div class="mp-info">
          <div class="mp-name">${escHtml(p.name)}</div>
          <div class="mp-meta">₱${parseFloat(p.price).toFixed(2)} · ${escHtml(p.category)}</div>
        </div>
        <button class="mp-feature${p.featured ? ' is-featured' : ''}" onclick="toggleFeatured('${d.id}', ${!!p.featured})" title="${p.featured ? 'Remove from Fresh Picks' : 'Show in Fresh Picks (home page)'}">${p.featured ? '⭐' : '☆'}</button>
        <button class="mp-edit"  onclick="editItem('${d.id}')">Edit</button>
        <button class="mp-delete" onclick="deleteItem('${d.id}')">✕</button>`;
      listEl.appendChild(li);
    });
  } catch (err) {
    listEl.innerHTML = '<li style="color:#c0392b;font-size:.85rem;">Could not load products.</li>';
  }
}

// ── Search box beside "Current Products" — filters the list live so the
// admin can quickly find the product they want to edit without scrolling. ──
function filterManageProductsList(rawValue) {
  const listEl      = document.getElementById('manage-products-list');
  const clearBtn    = document.getElementById('mp-search-clear');
  const noResultsEl = document.getElementById('mp-search-no-results');
  if (!listEl) return;

  const value = (rawValue || '').trim().toLowerCase();
  if (clearBtn) clearBtn.classList.toggle('hidden', value === '');

  const rows = listEl.querySelectorAll('.manage-product-row');
  let visibleCount = 0;
  rows.forEach(row => {
    const matches = value === '' || (row.dataset.searchName || '').includes(value);
    row.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  if (noResultsEl) {
    noResultsEl.style.display = (value !== '' && visibleCount === 0) ? 'block' : 'none';
  }
}

function clearManageProductsSearch() {
  const searchInput = document.getElementById('mp-search-input');
  if (searchInput) searchInput.value = '';
  filterManageProductsList('');
  if (searchInput) searchInput.focus();
}

// ── Add-on Management (used by the "🎀 Add-ons" tab) ──────────────────────────
let addonsCache = {}; // id -> addon data, populated when the admin list loads

function clearAddonForm() {
  document.getElementById('edit-addon-id').value  = '';
  document.getElementById('addon-name').value     = '';
  document.getElementById('addon-price').value    = '';
  document.getElementById('addon-image').value    = '';
  document.getElementById('add-addon-error').textContent = '';
  document.getElementById('add-addon-title').textContent = '🎀 Add New Add-on';
}

async function saveAddon() {
  const id    = document.getElementById('edit-addon-id').value.trim();
  const name  = document.getElementById('addon-name').value.trim();
  const price = parseFloat(document.getElementById('addon-price').value);
  const image = document.getElementById('addon-image').value.trim();
  const errEl = document.getElementById('add-addon-error');

  if (!name)                     { errEl.textContent = 'Please enter an add-on name.'; return; }
  if (isNaN(price) || price < 0) { errEl.textContent = 'Please enter a valid price.';   return; }
  errEl.textContent = '';

  const data = { name, price, image: image || '', updatedAt: serverTimestamp() };

  try {
    if (id) {
      await setDoc(doc(db, 'addons', id), data, { merge: true });
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'addons'), data);
    }
    clearAddonForm();
    loadManageAddonsList();
  } catch (err) {
    console.error('Failed to save add-on:', err);
    errEl.textContent = 'Could not save. Please try again.';
  }
}

function editAddon(id) {
  const a = addonsCache[id];
  if (!a) return;
  document.getElementById('edit-addon-id').value = id;
  document.getElementById('addon-name').value    = a.name || '';
  document.getElementById('addon-price').value   = a.price;
  document.getElementById('addon-image').value   = a.image || '';
  document.getElementById('add-addon-title').textContent = '✏️ Edit Add-on';
  document.getElementById('addon-name').focus();
}

async function deleteAddon(id) {
  if (!confirm('Delete this add-on?')) return;
  try {
    await deleteDoc(doc(db, 'addons', id));
    loadManageAddonsList();
  } catch (err) {
    console.error('Failed to delete add-on:', err);
    alert('Could not delete add-on.');
  }
}

async function loadManageAddonsList() {
  const listEl = document.getElementById('manage-addons-list');
  if (!listEl) return;
  listEl.innerHTML = '<li style="color:#7f8c8d;font-size:.85rem;">Loading…</li>';

  try {
    const snap = await getDocs(query(collection(db, 'addons'), orderBy('createdAt', 'asc')));
    if (snap.empty) {
      listEl.innerHTML = '<li style="color:#7f8c8d;font-size:.85rem;font-style:italic;">No add-ons yet.</li>';
      addonsCache = {};
      return;
    }
    listEl.innerHTML = '';
    addonsCache = {};
    snap.forEach(d => {
      const a = d.data();
      addonsCache[d.id] = a;
      const li = document.createElement('li');
      li.className = 'manage-product-row';
      li.innerHTML = `
        ${a.image ? `<img src="${escHtml(a.image)}" alt="${escHtml(a.name)}" style="width:34px;height:34px;border-radius:8px;object-fit:cover;margin-right:8px;flex-shrink:0;" onerror="this.style.display='none'" />` : ''}
        <div class="mp-info">
          <div class="mp-name">${escHtml(a.name)}</div>
          <div class="mp-meta">₱${parseFloat(a.price).toFixed(2)}</div>
        </div>
        <button class="mp-edit"  onclick="editAddon('${d.id}')">Edit</button>
        <button class="mp-delete" onclick="deleteAddon('${d.id}')">✕</button>`;
      listEl.appendChild(li);
    });
  } catch (err) {
    listEl.innerHTML = '<li style="color:#c0392b;font-size:.85rem;">Could not load add-ons.</li>';
  }
}

// ── Render Firestore products into the shop sections ─────────────────────────
async function renderProductsFromFirestore() {
  try {
    // NOTE: we intentionally do NOT use orderBy('createdAt') in the query itself.
    // Firestore silently excludes any document that's missing the field an
    // orderBy() sorts on — so a product saved without a createdAt (or whose
    // serverTimestamp() hadn't fully resolved yet) would vanish from the shop
    // even though it saved successfully. Fetching everything and sorting in
    // JS avoids that trap.
    const snap = await getDocs(collection(db, 'products'));
    const docs = snap.docs.slice().sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
      const bTime = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
      return aTime - bTime;
    });

    const bouquetsEl  = document.getElementById('bouquets-section');
    const souvenirsEl = document.getElementById('souvenirs-section');

    // Clear only dynamically-added items (those with data-dynamic="true")
    bouquetsEl.querySelectorAll('[data-dynamic]').forEach(el => el.remove());
    souvenirsEl.querySelectorAll('[data-dynamic]').forEach(el => el.remove());

    if (docs.length === 0) {
      const emptyMsg = '<p data-dynamic="true" style="color:#7f8c8d;font-style:italic;padding:20px 0;">No products yet — check back soon!</p>';
      bouquetsEl.innerHTML  = emptyMsg;
      souvenirsEl.innerHTML = emptyMsg;
      return;
    }

    docs.forEach(d => {
      const p       = d.data();
      const section = p.category === 'souvenirs' ? souvenirsEl : bouquetsEl;
      const div     = document.createElement('div');
      div.className    = 'product-item';
      div.dataset.dynamic = 'true';
      div.dataset.productId = d.id;

      // Color variants (optional). Each entry is { name, image }.
      const colors = Array.isArray(p.colors) ? p.colors.filter(c => c && c.name) : [];
      const initialImage = (colors.length && colors[0].image) ? colors[0].image : (p.image || '');
      div.dataset.selectedColor = '';
      // Store all color-variant names on the card so the search box can match
      // "red", "white", etc. even though those words never appear in the name.
      div.dataset.colors = colors.map(c => c.name).join(',').toLowerCase();

      const swatchesHtml = colors.length ? `
        <div class="color-swatch-row" role="group" aria-label="Choose a color">
          ${colors.map((c, idx) => `<button type="button" class="color-swatch" data-color-index="${idx}" title="${escHtml(c.name)}" aria-label="${escHtml(c.name)}" style="background-color:${escHtml(c.name)};"></button>`).join('')}
        </div>
        <p class="color-hint" style="display:none;">Please select a color before adding to cart</p>` : '';

      div.innerHTML = `
        ${initialImage ? `<img src="${escHtml(initialImage)}" alt="${escHtml(p.name)}" class="product-img" style="cursor:zoom-in;" onerror="this.style.display='none'" />` : '<div style="height:120px;background:#f0faf4;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:2rem;">🌸</div>'}
        ${swatchesHtml}
        <p class="price">₱${parseFloat(p.price).toFixed(2)}</p>
        <p>${escHtml(p.name)}</p>
        ${p.description ? '<button type="button" class="see-more-btn">See more</button>' : ''}
        <div style="display:flex;gap:8px;">
          <button class="add-to-cart" data-name="${escHtml(p.name)}" data-price="${p.price}" style="flex:1;">Add to Cart</button>
          <button type="button" class="addons-btn" data-name="${escHtml(p.name)}" data-price="${p.price}" style="flex:0 0 auto;padding:0 12px;">🎀 Add-ons</button>
        </div>`;

      // Wire up the round color-swatch buttons: picking one swaps the photo
      // shown for this product and remembers the choice on the card itself.
      if (colors.length) {
        const swatchBtns = div.querySelectorAll('.color-swatch');
        const hintEl      = div.querySelector('.color-hint');
        swatchBtns.forEach(btn => {
          btn.addEventListener('click', function () {
            const c = colors[parseInt(this.dataset.colorIndex, 10)];
            if (!c) return;
            div.dataset.selectedColor = c.name;
            swatchBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const currentImg = div.querySelector('.product-img');
            if (currentImg && c.image) currentImg.src = c.image;
            if (hintEl) hintEl.style.display = 'none';
          });
        });
      }

      // Wire up the add-to-cart button — nudge the user to pick a color first
      // if this product has color variants and none has been selected yet.
      div.querySelector('.add-to-cart').addEventListener('click', function () {
        if (colors.length && !div.dataset.selectedColor) {
          promptColorSelection(div);
          return;
        }
        const colorNote = div.dataset.selectedColor ? `Color: ${div.dataset.selectedColor}` : '';
        const currentImg = div.querySelector('.product-img');
        openQtyNotesModal(this.dataset.name, this.dataset.price, colorNote, currentImg ? currentImg.src : (p.image || ''), p.description || '');
      });
      // Wire up the product image to open the full-photo lightbox
      const imgEl = div.querySelector('img');
      if (imgEl) {
        imgEl.addEventListener('click', function () {
          openImageLightbox(this.src, this.alt);
        });
      }
      // Wire up the "See more" button to open the description modal
      const seeMoreBtn = div.querySelector('.see-more-btn');
      if (seeMoreBtn) {
        seeMoreBtn.addEventListener('click', function () {
          const currentImg = div.querySelector('.product-img');
          openDescriptionModal(p.name, p.price, p.description, currentImg ? currentImg.src : (p.image || ''));
        });
      }
      // Wire up the "Add-ons" button — same color requirement applies
      div.querySelector('.addons-btn').addEventListener('click', function () {
        if (colors.length && !div.dataset.selectedColor) {
          promptColorSelection(div);
          return;
        }
        const currentImg = div.querySelector('.product-img');
        openAddonsModal(this.dataset.name, this.dataset.price, div.dataset.selectedColor || '', currentImg ? currentImg.src : (p.image || ''), p.description || '');
      });
      section.appendChild(div);
    });
  } catch (err) {
    console.error('Could not load products from Firestore:', err);
  }
}

// Called right after the shop's products have rendered. If the person got here
// by tapping a Fresh Picks item on home.html, a product ID will be waiting in
// sessionStorage — scroll to that exact product card and give it a brief glow
// so it's obvious which one they clicked.
function highlightProductFromHome() {
  const targetId = sessionStorage.getItem('iharbor_highlight_product');
  if (!targetId) return;
  sessionStorage.removeItem('iharbor_highlight_product');

  const card = document.querySelector(`[data-product-id="${targetId}"]`);
  if (!card) return;

  // Make sure the right category tab is showing so the card is actually visible.
  const section = card.closest('#bouquets-section, #souvenirs-section');
  if (section && section.id === 'souvenirs-section') {
    showCategory('souvenirs');
  }

  // Give the browser a tick to finish the category switch before scrolling.
  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight-pulse');
    setTimeout(() => card.classList.remove('highlight-pulse'), 2200);
  }, 150);
}

// Shown when the customer tries to add a color-variant product to the cart
// (or open its add-ons) without picking a color first.
function promptColorSelection(productDiv) {
  const hintEl = productDiv.querySelector('.color-hint');
  const row    = productDiv.querySelector('.color-swatch-row');
  if (hintEl) hintEl.style.display = 'block';
  if (row) {
    row.classList.remove('shake');
    // restart the animation even if it was just triggered
    void row.offsetWidth;
    row.classList.add('shake');
    setTimeout(() => row.classList.remove('shake'), 450);
  }
  productDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Full-photo lightbox ────────────────────────────────────────────────────
function openImageLightbox(src, alt) {
  const lightbox = document.getElementById('image-lightbox');
  const img      = document.getElementById('lightbox-img');
  if (!lightbox || !img) return;
  img.src = src;
  img.alt = alt || '';
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeImageLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  const img      = document.getElementById('lightbox-img');
  if (!lightbox) return;
  lightbox.style.display = 'none';
  if (img) img.src = '';
  document.body.style.overflow = '';
}

// ── Product description modal ("See more") ────────────────────────────────
function openDescriptionModal(name, price, description, image) {
  const modal = document.getElementById('description-modal');
  const box   = document.getElementById('desc-modal-box');
  const imgEl = document.getElementById('desc-product-img');
  if (!modal) return;
  document.getElementById('desc-product-name').textContent  = name || '';
  document.getElementById('desc-product-price').textContent = '\u20B1' + parseFloat(price || 0).toFixed(2);
  document.getElementById('desc-product-text').textContent  = description || '';
  if (image) {
    imgEl.src = image;
    imgEl.alt = name || '';
    imgEl.style.display = '';
    box.classList.remove('no-image');
  } else {
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    box.classList.add('no-image');
  }
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeDescriptionModal() {
  const modal = document.getElementById('description-modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ─── Expose globals used by inline onclick handlers ───────────────────────────
window.showCategory       = showCategory;
window.filterProducts     = filterProducts;
window.clearProductSearch = clearProductSearch;
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
window.toggleSurpriseNote = toggleSurpriseNote;
window.toggleOtherReceiver = toggleOtherReceiver;
window.applyMapAddress    = applyMapAddress;
window.openImageLightbox  = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;
window.closeDescriptionModal = closeDescriptionModal;
window.searchMapLocation  = searchMapLocation;
window.initStoreMap       = initStoreMap;
window.openAdminPwModal   = openAdminPwModal;
window.closeAdminPwModal  = closeAdminPwModal;
window.submitAdminPassword = submitAdminPassword;
window.closeAddItemModal  = closeAddItemModal;
window.saveItem           = saveItem;
window.addColorRow        = addColorRow;
window.editItem           = editItem;
window.deleteItem         = deleteItem;
window.filterManageProductsList = filterManageProductsList;
window.clearManageProductsSearch = clearManageProductsSearch;
window.toggleFeatured     = toggleFeatured;
window.openQtyNotesModal  = openQtyNotesModal;
window.qnChangeQty        = qnChangeQty;
window.qnClose            = qnClose;
window.qnConfirm          = qnConfirm;
window.openAddonsModal    = openAddonsModal;
window.closeAddonsModal   = closeAddonsModal;
window.addonsModalContinue = addonsModalContinue;
window.addonsModalSkip    = addonsModalSkip;
window.switchManageTab    = switchManageTab;
window.saveAddon          = saveAddon;
window.clearAddonForm     = clearAddonForm;
window.editAddon          = editAddon;
window.deleteAddon        = deleteAddon;