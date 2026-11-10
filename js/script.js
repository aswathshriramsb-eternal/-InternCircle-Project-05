"use strict";

/**
 * Verdant & Co. — Mini E-Commerce Application Logic
 * Implements dynamic catalog rendering, category filtering, INR subtotal & delivery
 * calculations, LocalStorage persistence, accessible modal preview, and toast feedback.
 */

/* ==========================================================================
   Central Configuration & Product Catalogue Data (Pure JS Array of Objects)
   ========================================================================== */

const STORE_CONFIG = Object.freeze({
  STORAGE_KEY: "verdant_store_cart_v1",
  FREE_DELIVERY_THRESHOLD: 500,
  STANDARD_DELIVERY_FEE: 40,
  TOAST_TIMEOUT_MS: 3200
});

const PRODUCTS = Object.freeze([
  {
    id: "studio-notebook",
    name: "Studio Notebook",
    price: 249,
    category: "Desk",
    description: "160-page dotted archival cream paper bound in sage linen with a flat-lay spine.",
    image: "./assets/images/product-1-notebook.svg",
    imageText: "Studio Notebook bound in sage linen with cream pages"
  },
  {
    id: "arc-desk-lamp",
    name: "Arc Desk Lamp",
    price: 1899,
    category: "Desk",
    description: "Warm 3000K glare-free LED task lamp featuring an anodized charcoal stem and sage shade.",
    image: "./assets/images/product-2-lamp.svg",
    imageText: "Arc Desk Lamp with sage shade emitting a soft light cone"
  },
  {
    id: "cloud-ceramic-mug",
    name: "Cloud Ceramic Mug",
    price: 349,
    category: "Lifestyle",
    description: "Hand-glazed speckled stoneware mug built for slow pour-over mornings (320 ml).",
    image: "./assets/images/product-3-mug.svg",
    imageText: "Cloud Ceramic Mug in speckled off-white stoneware"
  },
  {
    id: "pulse-wireless-buds",
    name: "Pulse Wireless Buds",
    price: 2499,
    category: "Tech",
    description: "Compact ergonomic earbuds delivering crisp acoustics and 28-hour pocket charging.",
    image: "./assets/images/product-4-buds.svg",
    imageText: "Pulse Wireless Buds inside a matte sage and charcoal case"
  },
  {
    id: "everyday-tote",
    name: "Everyday Tote",
    price: 649,
    category: "Lifestyle",
    description: "Heavyweight 16 oz organic canvas carryall with wide cotton straps and slip organizer.",
    image: "./assets/images/product-5-tote.svg",
    imageText: "Everyday Tote in warm canvas with forest sage straps"
  },
  {
    id: "orbit-power-bank",
    name: "Orbit Power Bank",
    price: 1499,
    category: "Tech",
    description: "10,000 mAh pocket-slim aluminum fast charger with dual USB-C ports and charge indicators.",
    image: "./assets/images/product-6-powerbank.svg",
    imageText: "Orbit Power Bank in matte charcoal aluminum with lime LED dots"
  },
  {
    id: "nomad-bottle",
    name: "Nomad Bottle",
    price: 450,
    category: "Travel",
    description: "Double-wall vacuum insulated stainless flask keeping drinks chilled for 24 hours (650 ml).",
    image: "./assets/images/product-7-bottle.svg",
    imageText: "Nomad Bottle insulated flask in matte sage finish"
  },
  {
    id: "weekender-pouch",
    name: "Weekender Pouch",
    price: 899,
    category: "Travel",
    description: "Water-resistant ballistic weave organizer keeping cables, passports, and adapters tidy.",
    image: "./assets/images/product-8-pouch.svg",
    imageText: "Weekender Pouch zip travel organizer with lime zipper pull"
  }
]);

/* ==========================================================================
   Application State & Cached Selectors
   ========================================================================== */

let cart = {};
let activeCategory = "All Items";
let supportsDisplayTransitionCache;
let activeToastTimer = null;
let currentToastElement = null;
let toastRestoreFocusEl = null;

function getElements() {
  return {
    productGrid: document.getElementById("product-grid"),
    catalogCountLabel: document.getElementById("catalog-count-label"),
    filterBar: document.querySelector(".filter-bar"),
    cartItemsContainer: document.getElementById("cart-items"),
    navCartBtn: document.getElementById("nav-cart-btn"),
    navCartCount: document.getElementById("nav-cart-count"),
    cartBadgeCount: document.getElementById("cart-badge-count"),
    deliveryNote: document.getElementById("delivery-status-note"),
    cartSubtotal: document.getElementById("cart-subtotal"),
    cartDelivery: document.getElementById("cart-delivery"),
    cartGrandTotal: document.getElementById("cart-grand-total"),
    reviewOrderBtn: document.getElementById("review-order-btn"),
    checkoutModal: document.getElementById("checkout-modal"),
    modalItemsList: document.getElementById("modal-items-list"),
    modalSubtotal: document.getElementById("modal-subtotal"),
    modalDelivery: document.getElementById("modal-delivery"),
    modalGrandTotal: document.getElementById("modal-grand-total"),
    modalCloseX: document.getElementById("modal-close-x"),
    toastRegion: document.getElementById("toast-region"),
    announcer: document.getElementById("a11y-announcer")
  };
}

/* ==========================================================================
   Formatting & DOM Safety Helpers
   ========================================================================== */

function formatINR(amount) {
  return Number(amount || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR"
  });
}

function createSvgIcon(symbolId, className = "ui-icon", size = 18) {
  const svgNS = "http://www.w3.org/2000/svg";
  const useNS = "http://www.w3.org/1999/xlink";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));

  const use = document.createElementNS(svgNS, "use");
  use.setAttribute("href", `#${symbolId}`);
  use.setAttributeNS(useNS, "xlink:href", `#${symbolId}`);
  svg.appendChild(use);
  return svg;
}

function announceStatus(message) {
  if (!message) return;
  const { announcer } = getElements();

  if (typeof document.ariaNotify === "function") {
    try {
      document.ariaNotify(message);
      return;
    } catch (_) {
      // Fallback cleanly to live region below
    }
  }

  if (announcer) {
    announcer.textContent = "";
    setTimeout(() => {
      announcer.textContent = message;
    }, 60);
  }
}

/* ==========================================================================
   Core Required Cart, Persistence & Calculation Functions
   ========================================================================== */

/**
 * Adds a product to the cart by product ID, or increments its quantity if present.
 */
function addToCart(id) {
  const product = PRODUCTS.find((item) => item.id === id);
  if (!product) return;

  const currentQty = cart[id] || 0;
  cart[id] = currentQty + 1;

  saveCart();
  renderCart();

  const feedbackText = `Added ${product.name} to your bag.`;
  showToast(feedbackText);
  announceStatus(feedbackText);
}

/**
 * Adjusts item quantity by delta (+1 or -1) and deletes the item when quantity <= 0.
 */
function changeQuantity(id, delta) {
  const product = PRODUCTS.find((item) => item.id === id);
  if (!product || !cart[id]) return;

  const nextQty = cart[id] + Number(delta);
  if (nextQty <= 0) {
    delete cart[id];
    saveCart();
    renderCart();
    announceStatus(`Removed ${product.name} from bag.`);
    return;
  }

  cart[id] = nextQty;
  saveCart();
  renderCart();
}

/**
 * Removes an item completely from the cart and refreshes totals and badges.
 */
function removeItem(id) {
  const product = PRODUCTS.find((item) => item.id === id);
  if (!cart[id]) return;

  delete cart[id];
  saveCart();
  renderCart();

  if (product) {
    const msg = `Removed ${product.name} from your bag.`;
    showToast(msg);
    announceStatus(msg);
  }
}

/**
 * Computes itemCount, subtotal using Array.prototype.reduce(), deliveryFee, and grandTotal.
 * Delivery rule: ₹40 below ₹500 subtotal; ₹0 (free) at ₹500 or above; ₹0 when cart is empty.
 */
function calculateTotals() {
  const lineEntries = Object.entries(cart)
    .map(([id, quantity]) => {
      const product = PRODUCTS.find((p) => p.id === id);
      if (!product || !Number.isInteger(quantity) || quantity <= 0) return null;
      return {
        product,
        quantity,
        lineTotal: product.price * quantity
      };
    })
    .filter(Boolean);

  const itemCount = lineEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const subtotal = lineEntries.reduce((sum, entry) => sum + entry.lineTotal, 0);

  let deliveryFee = 0;
  if (itemCount > 0 && subtotal < STORE_CONFIG.FREE_DELIVERY_THRESHOLD) {
    deliveryFee = STORE_CONFIG.STANDARD_DELIVERY_FEE;
  }

  const grandTotal = itemCount > 0 ? subtotal + deliveryFee : 0;

  return {
    lineEntries,
    itemCount,
    subtotal,
    deliveryFee,
    grandTotal
  };
}

/**
 * Persists the current cart object to LocalStorage safely.
 */
function saveCart() {
  try {
    localStorage.setItem(STORE_CONFIG.STORAGE_KEY, JSON.stringify(cart));
  } catch (_) {
    // Gracefully handle restricted storage environments
  }
}

/**
 * Restores and validates saved cart data from LocalStorage on page load.
 * Rejects malformed JSON, invalid product IDs, and non-positive quantities.
 */
function loadCart() {
  cart = {};
  let raw = null;
  try {
    raw = localStorage.getItem(STORE_CONFIG.STORAGE_KEY);
  } catch (_) {
    return cart;
  }

  if (!raw) return cart;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return cart;
    }

    const validated = {};
    for (const [productId, qty] of Object.entries(parsed)) {
      const exists = PRODUCTS.find((item) => item.id === productId);
      if (exists && Number.isInteger(qty) && qty > 0 && qty <= 999) {
        validated[productId] = qty;
      }
    }
    cart = validated;
  } catch (_) {
    cart = {};
  }

  return cart;
}

/* ==========================================================================
   Dynamic Rendering Functions (XSS-Safe via DOM & textContent)
   ========================================================================== */

/**
 * Filters PRODUCTS by activeCategory using Array.prototype.filter() and builds
 * aligned product cards cleanly via document.createElement and textContent.
 */
function renderProducts() {
  const { productGrid, catalogCountLabel } = getElements();
  if (!productGrid) return;

  const filteredProducts = activeCategory === "All Items"
    ? PRODUCTS
    : PRODUCTS.filter((product) => product.category === activeCategory);

  if (catalogCountLabel) {
    const countText = filteredProducts.length === 1 ? "1 item" : `${filteredProducts.length} items`;
    catalogCountLabel.textContent = activeCategory === "All Items"
      ? `Showing all ${countText} across Desk, Lifestyle, Tech, and Travel.`
      : `Showing ${countText} in ${activeCategory}.`;
  }

  productGrid.replaceChildren();

  filteredProducts.forEach((product, index) => {
    const card = document.createElement("article");
    card.className = "product-card";

    // Row 1: Product visual media
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "product-media";

    const img = document.createElement("img");
    img.className = "product-image";
    img.src = product.image;
    img.alt = product.imageText || product.name;
    img.width = 400;
    img.height = 300;
    if (index >= 2) {
      img.loading = "lazy";
    }

    const categoryBadge = document.createElement("span");
    categoryBadge.className = "product-category-pill";
    categoryBadge.textContent = product.category;

    mediaWrap.appendChild(img);
    mediaWrap.appendChild(categoryBadge);

    // Row 2: Header
    const header = document.createElement("div");
    header.className = "product-header";
    const title = document.createElement("h3");
    title.className = "product-name";
    title.textContent = product.name;
    header.appendChild(title);

    // Row 3: Description
    const desc = document.createElement("p");
    desc.className = "product-description";
    desc.textContent = product.description;

    // Row 4: Price + Add to Cart CTA
    const footer = document.createElement("div");
    footer.className = "product-footer";

    const priceEl = document.createElement("span");
    priceEl.className = "product-price";
    priceEl.textContent = formatINR(product.price);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-primary add-to-cart-btn";
    addBtn.dataset.productId = product.id;
    addBtn.setAttribute("aria-label", `Add to Cart — ${product.name}`);
    addBtn.appendChild(createSvgIcon("icon-plus", "ui-icon", 16));
    const btnText = document.createElement("span");
    btnText.textContent = "Add to Cart";
    addBtn.appendChild(btnText);

    footer.appendChild(priceEl);
    footer.appendChild(addBtn);

    card.appendChild(mediaWrap);
    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(footer);

    productGrid.appendChild(card);
  });
}

/**
 * Renders cart line items, empty state, quantity steppers, delivery threshold status,
 * totals, navigation bag count badge, and checkout button disabled state.
 */
function renderCart() {
  const {
    cartItemsContainer,
    navCartCount,
    cartBadgeCount,
    deliveryNote,
    cartSubtotal,
    cartDelivery,
    cartGrandTotal,
    reviewOrderBtn
  } = getElements();

  const { lineEntries, itemCount, subtotal, deliveryFee, grandTotal } = calculateTotals();

  if (navCartCount) {
    navCartCount.textContent = String(itemCount);
  }
  if (cartBadgeCount) {
    cartBadgeCount.textContent = itemCount === 1 ? "1 item" : `${itemCount} items`;
  }

  if (deliveryNote) {
    if (itemCount === 0) {
      deliveryNote.textContent = "Free delivery unlocks on orders of ₹500 or above.";
      deliveryNote.classList.remove("is-unlocked");
    } else if (subtotal < STORE_CONFIG.FREE_DELIVERY_THRESHOLD) {
      const remaining = STORE_CONFIG.FREE_DELIVERY_THRESHOLD - subtotal;
      deliveryNote.textContent = `Add ${formatINR(remaining)} more for free delivery (₹40 fee applied).`;
      deliveryNote.classList.remove("is-unlocked");
    } else {
      deliveryNote.textContent = "Free delivery unlocked for your order.";
      deliveryNote.classList.add("is-unlocked");
    }
  }

  if (cartSubtotal) {
    cartSubtotal.textContent = formatINR(subtotal);
  }
  if (cartDelivery) {
    cartDelivery.textContent = itemCount > 0 && deliveryFee === 0 ? "Free" : formatINR(deliveryFee);
  }
  if (cartGrandTotal) {
    cartGrandTotal.textContent = formatINR(grandTotal);
  }
  if (reviewOrderBtn) {
    reviewOrderBtn.disabled = itemCount === 0;
  }

  if (!cartItemsContainer) return;
  cartItemsContainer.replaceChildren();

  if (lineEntries.length === 0) {
    const emptyBox = document.createElement("div");
    emptyBox.className = "cart-empty";

    const emptyTitle = document.createElement("p");
    emptyTitle.className = "cart-empty-title";
    emptyTitle.textContent = "Your bag is empty";

    const emptyText = document.createElement("p");
    emptyText.className = "cart-empty-text";
    emptyText.textContent = "Select items from the catalogue to start building your order.";

    emptyBox.appendChild(emptyTitle);
    emptyBox.appendChild(emptyText);
    cartItemsContainer.appendChild(emptyBox);
    return;
  }

  lineEntries.forEach(({ product, quantity, lineTotal }) => {
    const row = document.createElement("article");
    row.className = "cart-item";

    const thumb = document.createElement("img");
    thumb.className = "cart-item-thumb";
    thumb.src = product.image;
    thumb.alt = "";
    thumb.width = 60;
    thumb.height = 45;

    const body = document.createElement("div");
    body.className = "cart-item-body";

    const top = document.createElement("div");
    top.className = "cart-item-top";

    const info = document.createElement("div");
    const nameEl = document.createElement("h3");
    nameEl.className = "cart-item-name";
    nameEl.textContent = product.name;

    const unitEl = document.createElement("div");
    unitEl.className = "cart-item-unit";
    unitEl.textContent = `${formatINR(product.price)} each`;

    info.appendChild(nameEl);
    info.appendChild(unitEl);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-item-btn";
    removeBtn.dataset.action = "remove";
    removeBtn.dataset.productId = product.id;
    removeBtn.setAttribute("aria-label", `Remove ${product.name} from bag`);
    removeBtn.appendChild(createSvgIcon("icon-trash", "ui-icon", 16));

    top.appendChild(info);
    top.appendChild(removeBtn);

    const controls = document.createElement("div");
    controls.className = "cart-item-controls";

    const stepper = document.createElement("div");
    stepper.className = "qty-stepper";

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = "qty-btn";
    decBtn.dataset.action = "decrease";
    decBtn.dataset.productId = product.id;
    decBtn.setAttribute("aria-label", `Decrease quantity of ${product.name}`);
    decBtn.appendChild(createSvgIcon("icon-minus", "ui-icon", 14));

    const qtyDisplay = document.createElement("span");
    qtyDisplay.className = "qty-value";
    qtyDisplay.textContent = String(quantity);

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.className = "qty-btn";
    incBtn.dataset.action = "increase";
    incBtn.dataset.productId = product.id;
    incBtn.setAttribute("aria-label", `Increase quantity of ${product.name}`);
    incBtn.appendChild(createSvgIcon("icon-plus", "ui-icon", 14));

    stepper.appendChild(decBtn);
    stepper.appendChild(qtyDisplay);
    stepper.appendChild(incBtn);

    const lineTotalEl = document.createElement("span");
    lineTotalEl.className = "cart-line-total";
    lineTotalEl.textContent = formatINR(lineTotal);

    controls.appendChild(stepper);
    controls.appendChild(lineTotalEl);

    body.appendChild(top);
    body.appendChild(controls);

    row.appendChild(thumb);
    row.appendChild(body);
    cartItemsContainer.appendChild(row);
  });
}

/* ==========================================================================
   Native Modal Checkout Preview & Top-Layer Transition Helpers
   ========================================================================== */

function canTransitionDisplay() {
  if (supportsDisplayTransitionCache !== undefined) return supportsDisplayTransitionCache;
  if (!window.CSS?.supports?.("transition-behavior", "allow-discrete") || !document.body) {
    supportsDisplayTransitionCache = false;
    return false;
  }

  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransitionCache = getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransitionCache;
}

function supportsTopLayerExit() {
  return Boolean(window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay());
}

async function closeModalDialog(dialog, returnVal = "") {
  if (!dialog || !dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute("data-closing", "");
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 600))
      ]);
    }
    if (!dialog.hasAttribute("data-closing")) return;
    dialog.removeAttribute("data-closing");
  }
  dialog.close(returnVal);
}

function openCheckoutPreview() {
  const {
    checkoutModal,
    modalItemsList,
    modalSubtotal,
    modalDelivery,
    modalGrandTotal
  } = getElements();

  const { lineEntries, itemCount, subtotal, deliveryFee, grandTotal } = calculateTotals();
  if (itemCount === 0 || !checkoutModal || !modalItemsList) return;

  modalItemsList.replaceChildren();

  lineEntries.forEach(({ product, quantity, lineTotal }) => {
    const li = document.createElement("li");
    li.className = "modal-line-item";

    const left = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "modal-line-name";
    nameEl.textContent = product.name;

    const qtyEl = document.createElement("div");
    qtyEl.className = "modal-line-qty";
    qtyEl.textContent = `Qty: ${quantity} × ${formatINR(product.price)}`;

    left.appendChild(nameEl);
    left.appendChild(qtyEl);

    const priceEl = document.createElement("span");
    priceEl.className = "modal-line-price";
    priceEl.textContent = formatINR(lineTotal);

    li.appendChild(left);
    li.appendChild(priceEl);
    modalItemsList.appendChild(li);
  });

  if (modalSubtotal) modalSubtotal.textContent = formatINR(subtotal);
  if (modalDelivery) {
    modalDelivery.textContent = deliveryFee === 0 ? "Free" : formatINR(deliveryFee);
  }
  if (modalGrandTotal) modalGrandTotal.textContent = formatINR(grandTotal);

  checkoutModal.returnValue = "";
  checkoutModal.showModal();
}

function setupDialogEnhancements() {
  const { checkoutModal, modalCloseX } = getElements();
  if (!checkoutModal) return;

  // Progressive enhancement fallback for browsers without native closedby="any"
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    const isOutsideDialog = (event, dialog) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    checkoutModal.addEventListener("pointerdown", (event) => {
      pressedOutside = isOutsideDialog(event, checkoutModal);
    });
    checkoutModal.addEventListener("pointerup", (event) => {
      if (pressedOutside && isOutsideDialog(event, checkoutModal)) {
        closeModalDialog(checkoutModal);
      }
    });
  }

  checkoutModal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModalDialog(checkoutModal);
  });

  if (modalCloseX) {
    modalCloseX.addEventListener("click", () => {
      closeModalDialog(checkoutModal, "close");
    });
  }

  checkoutModal.addEventListener("close", () => {
    const chosen = checkoutModal.returnValue;
    checkoutModal.returnValue = "";
    if (chosen === "confirm") {
      const msg = "Demo order reviewed — thank you for shopping with Verdant & Co.";
      showToast(msg);
      announceStatus(msg);
    }
  });
}

/* ==========================================================================
   Accessible Toast Notifications (Popover Manual + Modal Suppression)
   ========================================================================== */

function hideCurrentToast(restoreFocus = false) {
  clearTimeout(activeToastTimer);
  activeToastTimer = null;

  if (!currentToastElement) return;
  const el = currentToastElement;
  currentToastElement = null;

  if (typeof el.hidePopover === "function" && el.matches(":popover-open")) {
    try {
      el.hidePopover();
    } catch (_) {
      // ignore if already hidden
    }
  }
  el.remove();

  if (restoreFocus && toastRestoreFocusEl && typeof toastRestoreFocusEl.focus === "function") {
    toastRestoreFocusEl.focus();
  }
  toastRestoreFocusEl = null;
}

function showToast(message) {
  const { toastRegion, checkoutModal } = getElements();
  if (!toastRegion || !message) return;

  // Never show background toast notifications while a modal dialog is open
  if (checkoutModal && checkoutModal.open) return;

  hideCurrentToast(false);

  const toast = document.createElement("div");
  toast.className = "toast-item";
  const toastId = `toast-${Date.now()}`;
  toast.id = toastId;

  if (Object.hasOwn(HTMLElement.prototype, "popover")) {
    toast.setAttribute("popover", "manual");
  }

  const msgWrap = document.createElement("div");
  msgWrap.className = "toast-message";

  const dot = document.createElement("span");
  dot.className = "toast-dot";
  dot.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = message;

  msgWrap.appendChild(dot);
  msgWrap.appendChild(text);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close-btn";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.appendChild(createSvgIcon("icon-x", "ui-icon", 16));

  closeBtn.addEventListener("click", () => {
    const hadFocus = toast.contains(document.activeElement);
    hideCurrentToast(hadFocus);
  });

  toast.addEventListener("focusin", () => {
    clearTimeout(activeToastTimer);
  });
  toast.addEventListener("focusout", () => {
    if (!toast.contains(document.activeElement)) {
      scheduleToastTimeout();
    }
  });
  toast.addEventListener("mouseenter", () => clearTimeout(activeToastTimer));
  toast.addEventListener("mouseleave", () => scheduleToastTimeout());

  toast.appendChild(msgWrap);
  toast.appendChild(closeBtn);
  toastRegion.appendChild(toast);

  currentToastElement = toast;
  toastRestoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (typeof toast.showPopover === "function") {
    try {
      toast.showPopover();
    } catch (_) {
      // Render cleanly inside fixed region fallback
    }
  }

  scheduleToastTimeout();
}

function scheduleToastTimeout() {
  clearTimeout(activeToastTimer);
  activeToastTimer = setTimeout(() => {
    if (currentToastElement && !currentToastElement.contains(document.activeElement)) {
      hideCurrentToast(false);
    }
  }, STORE_CONFIG.TOAST_TIMEOUT_MS);
}

/* ==========================================================================
   Event Delegation & Initialization
   ========================================================================== */

function initStorefront() {
  const {
    productGrid,
    filterBar,
    cartItemsContainer,
    reviewOrderBtn,
    navCartBtn
  } = getElements();

  // Delegated click handler on Product Catalogue
  if (productGrid) {
    productGrid.addEventListener("click", (event) => {
      const addBtn = event.target.closest(".add-to-cart-btn");
      if (!addBtn || !addBtn.dataset.productId) return;
      addToCart(addBtn.dataset.productId);
    });
  }

  // Delegated click handler on Category Filter Buttons
  if (filterBar) {
    filterBar.addEventListener("click", (event) => {
      const btn = event.target.closest(".filter-btn");
      if (!btn || !btn.dataset.category) return;

      activeCategory = btn.dataset.category;
      filterBar.querySelectorAll(".filter-btn").forEach((pill) => {
        pill.setAttribute("aria-pressed", pill === btn ? "true" : "false");
      });

      renderProducts();
    });
  }

  // Delegated click handler on Shopping Bag Controls (-, +, Remove)
  if (cartItemsContainer) {
    cartItemsContainer.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-action][data-product-id]");
      if (!actionBtn) return;

      const { action, productId } = actionBtn.dataset;
      if (action === "increase") {
        changeQuantity(productId, 1);
      } else if (action === "decrease") {
        changeQuantity(productId, -1);
      } else if (action === "remove") {
        removeItem(productId);
      }
    });
  }

  if (reviewOrderBtn) {
    reviewOrderBtn.addEventListener("click", openCheckoutPreview);
  }

  if (navCartBtn) {
    navCartBtn.addEventListener("click", () => {
      const cartSection = document.getElementById("cart-section");
      const cartHeading = document.getElementById("cart-heading");
      if (cartSection) {
        cartSection.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      if (cartHeading) {
        cartHeading.focus({ preventScroll: true });
      }
    });
  }

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((other) => {
        other.classList.remove("is-active");
        other.removeAttribute("aria-current");
      });
      link.classList.add("is-active");
      link.setAttribute("aria-current", "location");
    });
  });

  setupDialogEnhancements();
  loadCart();
  renderProducts();
  renderCart();
}

document.addEventListener("DOMContentLoaded", initStorefront);
