// ─── Firebase Setup ───────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
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

// ─── Cart State ───────────────────────────────────────────────────────────────
let cart      = [];
let cartCount = 0;

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  showCategory('bouquets');

  document.querySelectorAll('.add-to-cart').forEach(button => {
    button.addEventListener('click', function () {
      addToCart(this.getAttribute('data-name'), this.getAttribute('data-price'));
    });
  });

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

function updateCartButton() {
  document.getElementById('cart-button').textContent = `Cart (${cartCount})`;
}

function toggleCart() {
  const modal     = document.getElementById('cart-modal');
  const isVisible = modal.style.display !== 'none';
  if (isVisible) {
    modal.style.display    = 'none';
    document.body.style.overflow = 'auto';
  } else {
    modal.style.display    = 'flex';
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

function processCheckout() {
  const customerName   = document.getElementById('customer-name').value.trim();
  const customerPhone  = document.getElementById('customer-phone').value.trim();
  const deliveryOption = document.getElementById('delivery-option').value;

  if (!customerName || !customerPhone || !deliveryOption) {
    alert('Please fill in all required fields.');
    return;
  }

  let total       = cart.reduce((s, i) => s + i.quantity * i.price, 0);
  let deliveryFee = 0, deliveryText = '';

  switch (deliveryOption) {
    case 'pickup':   deliveryText = 'Pick Up (No Fee)';    deliveryFee = 0;   break;
    case 'meetup':   deliveryText = 'Meet Up (₱50 Fee)';   deliveryFee = 50;  break;
    case 'delivery': deliveryText = 'Delivery (₱100 Fee)'; deliveryFee = 100; break;
  }
  total += deliveryFee;

  document.getElementById('customer-name-display').textContent    = customerName;
  document.getElementById('customer-phone-display').textContent   = customerPhone;
  document.getElementById('delivery-option-display').textContent  = deliveryText;
  document.getElementById('total-price-display').textContent      = total.toFixed(2);

  document.getElementById('checkout-form').style.display       = 'none';
  document.getElementById('confirmation-section').style.display = 'flex';
}

// ─── Save Order to Firestore ──────────────────────────────────────────────────
async function recordOrder() {
  const order = {
    date:           serverTimestamp(),
    customerName:   document.getElementById('customer-name-display').textContent,
    customerPhone:  document.getElementById('customer-phone-display').textContent,
    deliveryOption: document.getElementById('delivery-option-display').textContent,
    total:          parseFloat(document.getElementById('total-price-display').textContent),
    items:          cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
    status:         'New'
  };

  try {
    await addDoc(collection(db, 'orders'), order);
  } catch (err) {
    console.error('Failed to save order to Firestore:', err);
    // Don't block the UX — order details already shown to customer
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
  document.getElementById('checkout-form').style.display       = 'none';
  document.getElementById('confirmation-section').style.display = 'none';
  document.body.style.overflow = 'auto';
}

// ─── Expose globals used by inline onclick handlers ───────────────────────────
window.showCategory    = showCategory;
window.toggleCart      = toggleCart;
window.removeFromCart  = removeFromCart;
window.checkout        = checkout;
window.finishCheckout  = finishCheckout;
window.cancelCheckout  = cancelCheckout;