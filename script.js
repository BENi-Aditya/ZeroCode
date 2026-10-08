/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OWE-ASIS — FINE DINING BILLFOLIO & SETTLEMENT
 * Pure Vanilla JavaScript · Integer-Paise Exact Allocation
 * No external dependencies, CDNs, or frameworks.
 */

(function () {
  'use strict';

  // DOM Elements
  const form = document.getElementById('splitterForm');
  const occasionInput = document.getElementById('occasionInput');
  const billInput = document.getElementById('billInput');
  const peopleInput = document.getElementById('peopleInput');
  const incPeopleBtn = document.getElementById('incPeopleBtn');
  const decPeopleBtn = document.getElementById('decPeopleBtn');
  const resetBtn = document.getElementById('resetBtn');

  const errorAlert = document.getElementById('errorAlert');
  const errorMessage = document.getElementById('errorMessage');

  const receiptPlaceholder = document.getElementById('receiptPlaceholder');
  const billReceipt = document.getElementById('billReceipt');

  const receiptOccasion = document.getElementById('receiptOccasion');
  const receiptTimestamp = document.getElementById('receiptTimestamp');
  const receiptRef = document.getElementById('receiptRef');
  const receiptGuests = document.getElementById('receiptGuests');
  const receiptHeroAmount = document.getElementById('receiptHeroAmount');
  const receiptHeroNote = document.getElementById('receiptHeroNote');
  const receiptItemsList = document.getElementById('receiptItemsList');
  const receiptOriginalBill = document.getElementById('receiptOriginalBill');
  const receiptSharesSum = document.getElementById('receiptSharesSum');
  const receiptDifference = document.getElementById('receiptDifference');
  const receiptBarcodeNum = document.getElementById('receiptBarcodeNum');

  const copyBreakdownBtn = document.getElementById('copyBreakdownBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  const printReceiptBtn = document.getElementById('printReceiptBtn');
  const storageStatusText = document.getElementById('storageStatusText');
  const presetButtons = document.querySelectorAll('.preset-chip, .btn-preset');

  // Book animation & Live Clock elements
  const billBook = document.getElementById('billBook');
  const bookCover = document.getElementById('bookCover');
  const toggleBookBtn = document.getElementById('toggleBookBtn');
  const toggleBookLabel = document.getElementById('toggleBookLabel');
  const liveTimeDisplay = document.getElementById('liveTimeDisplay');

  const STORAGE_KEY = 'owe_asis_billfolio_state';

  // Cached active calculation & animation timer
  let currentSplitData = null;
  let openCoverTimer = null;

  /**
   * Update the live service clock
   */
  function updateLiveClock() {
    if (!liveTimeDisplay) return;
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    liveTimeDisplay.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
  }

  /**
   * Format a date into clean restaurant receipt timestamp
   */
  function formatReceiptDate(date) {
    const d = date || new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
  }

  /**
   * Generate a pseudorandom yet deterministic-looking check reference
   */
  function generateBillRef(seed) {
    let hash = 0;
    const str = seed + Date.now().toString();
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const num = Math.abs(hash) % 90000 + 10000;
    return `#SPL-${num}`;
  }

  /**
   * Generate clean EAN-13 style barcode numeric string
   */
  function generateBarcodeString(seed) {
    let hash = 0;
    const str = 'BARCODE' + seed;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const suffix = String(Math.abs(hash)).padStart(8, '0').slice(-8);
    return `890${suffix}2`;
  }

  /**
   * Book Cover Opening / Closing Control (Instant and reliable)
   */
  function openFolio() {
    if (openCoverTimer) {
      clearTimeout(openCoverTimer);
      openCoverTimer = null;
    }
    if (!billBook) return;
    billBook.classList.remove('book-closed');
    billBook.classList.add('book-open');
    if (toggleBookLabel) toggleBookLabel.textContent = 'Close Folio';
  }

  function closeFolio() {
    if (openCoverTimer) {
      clearTimeout(openCoverTimer);
      openCoverTimer = null;
    }
    if (!billBook) return;
    billBook.classList.remove('book-open');
    billBook.classList.add('book-closed');
    if (toggleBookLabel) toggleBookLabel.textContent = 'Open Folio';
  }

  function toggleFolio() {
    if (!billBook) return;
    if (billBook.classList.contains('book-closed')) {
      openFolio();
    } else {
      closeFolio();
    }
  }

  if (toggleBookBtn) {
    toggleBookBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleFolio();
    });
  }

  if (bookCover) {
    bookCover.addEventListener('click', function (e) {
      if (billBook && billBook.classList.contains('book-closed')) {
        e.preventDefault();
        openFolio();
      }
    });
  }

  /**
   * Clear error state and banner notices
   */
  function clearErrors() {
    errorAlert.classList.add('hidden');
    errorMessage.textContent = '';
    occasionInput.classList.remove('input-error');
    billInput.classList.remove('input-error');
    peopleInput.classList.remove('input-error');
  }

  /**
   * Display notice banner and highlight problematic field
   */
  function showError(msg, targetInput) {
    errorMessage.textContent = msg;
    errorAlert.classList.remove('hidden');

    if (targetInput) {
      targetInput.classList.add('input-error');
      targetInput.focus();
    }

    // Hide active receipt if input is invalid
    billReceipt.classList.add('hidden');
    receiptPlaceholder.classList.remove('hidden');
    currentSplitData = null;
  }

  /**
   * Validate all form inputs
   * @returns {Object|null} Validated data or null if invalid
   */
  function validateInputs() {
    clearErrors();

    const occasionVal = occasionInput.value.trim();
    const billVal = billInput.value.trim();
    const peopleVal = peopleInput.value.trim();

    // 1. Validate Occasion Name
    if (!occasionVal) {
      showError('Please enter an occasion or table reference.', occasionInput);
      return null;
    }

    // 2. Validate Bill Amount
    if (!billVal) {
      showError('Please enter the total bill amount.', billInput);
      return null;
    }

    const billNum = Number(billVal);
    if (isNaN(billNum)) {
      showError('The bill amount must be a valid numeric figure.', billInput);
      return null;
    }

    if (billNum <= 0) {
      if (billNum === 0) {
        showError('The bill amount must be greater than zero. A ₹0.00 check cannot be divided.', billInput);
      } else {
        showError('The bill amount cannot be negative.', billInput);
      }
      return null;
    }

    if (billNum > 10000000) {
      showError('The bill amount exceeds the maximum permissible limit of ₹10,000,000.', billInput);
      return null;
    }

    // 3. Validate People Count
    if (!peopleVal) {
      showError('Please specify the number of guests sharing the bill.', peopleInput);
      return null;
    }

    if (peopleVal.includes('.')) {
      showError('The number of guests must be a whole integer. Fractional guests (such as 2.5) are not permitted.', peopleInput);
      return null;
    }

    const peopleNum = Number(peopleVal);
    if (isNaN(peopleNum) || !Number.isInteger(peopleNum)) {
      showError('The number of guests must be a valid whole number.', peopleInput);
      return null;
    }

    if (peopleNum <= 0) {
      if (peopleNum === 0) {
        showError('The number of guests must be at least 1.', peopleInput);
      } else {
        showError('The number of guests cannot be negative.', peopleInput);
      }
      return null;
    }

    if (peopleNum > 500) {
      showError('The guest party size cannot exceed 500.', peopleInput);
      return null;
    }

    return {
      occasion: occasionVal,
      billAmount: billNum,
      peopleCount: peopleNum
    };
  }

  /**
   * EXACT INTEGER PAISE SPLITTING ALGORITHM
   * Calculates per-person shares such that the sum of individual shares
   * is mathematically guaranteed to equal the original bill down to the last paise.
   */
  function calculateSplit(occasion, billAmount, peopleCount, savedTimestamp, savedRef) {
    // Convert bill amount to integer paise
    const totalPaise = Math.round(billAmount * 100);

    // Baseline integer paise per guest
    const basePaise = Math.floor(totalPaise / peopleCount);

    // Remainder paise to balance evenly
    const remainderPaise = totalPaise % peopleCount;

    const shares = [];
    let cumulativeSumPaise = 0;

    for (let i = 0; i < peopleCount; i++) {
      const personPaise = (i < remainderPaise) ? (basePaise + 1) : basePaise;
      cumulativeSumPaise += personPaise;

      shares.push({
        index: i + 1,
        label: `Guest ${String(i + 1).padStart(2, '0')}`,
        paise: personPaise,
        rupees: (personPaise / 100).toFixed(2),
        hasExtraPaise: (i < remainderPaise)
      });
    }

    const timestamp = savedTimestamp || formatReceiptDate(new Date());
    const ref = savedRef || generateBillRef(occasion + totalPaise + peopleCount);
    const barcode = generateBarcodeString(ref);

    return {
      occasion,
      billAmount,
      totalPaise,
      peopleCount,
      basePaise,
      remainderPaise,
      shares,
      cumulativeSumPaise,
      timestamp,
      ref,
      barcode
    };
  }

  /**
   * Render the split result into the guest check DOM
   */
  function renderReceipt(splitData) {
    receiptOccasion.textContent = splitData.occasion;
    receiptTimestamp.textContent = splitData.timestamp;
    receiptRef.textContent = splitData.ref;
    receiptGuests.textContent = `${splitData.peopleCount} ${splitData.peopleCount === 1 ? 'Guest' : 'Guests'}`;
    receiptBarcodeNum.textContent = splitData.barcode;

    const baseRupees = (splitData.basePaise / 100).toFixed(2);
    const extraRupees = ((splitData.basePaise + 1) / 100).toFixed(2);

    if (splitData.remainderPaise === 0) {
      receiptHeroAmount.textContent = `₹${baseRupees}`;
      receiptHeroNote.textContent = 'Equal allocation across all guests';
    } else {
      receiptHeroAmount.textContent = `₹${extraRupees} / ₹${baseRupees}`;
      receiptHeroNote.textContent = `${splitData.remainderPaise} ${splitData.remainderPaise === 1 ? 'guest contributes' : 'guests contribute'} ₹${extraRupees} · ${splitData.peopleCount - splitData.remainderPaise} contribute ₹${baseRupees} (1p balanced)`;
    }

    // Populate Itemized Guest Rows
    receiptItemsList.innerHTML = '';
    splitData.shares.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'check-row-item';
      row.innerHTML = `
        <div class="check-guest-left">
          <span class="guest-idx">#${String(item.index).padStart(2, '0')}</span>
          <span class="guest-name">${item.label}</span>
          ${item.hasExtraPaise ? '<span class="paise-badge">(+1p)</span>' : ''}
        </div>
        <span class="guest-share-amount">₹${item.rupees}</span>
      `;
      receiptItemsList.appendChild(row);
    });

    // Totals & Variance Verification
    const originalFormatted = (splitData.totalPaise / 100).toFixed(2);
    const sharesSumFormatted = (splitData.cumulativeSumPaise / 100).toFixed(2);
    const diffPaise = splitData.totalPaise - splitData.cumulativeSumPaise;
    const diffFormatted = (diffPaise / 100).toFixed(2);

    receiptOriginalBill.textContent = `₹${originalFormatted}`;
    receiptSharesSum.textContent = `₹${sharesSumFormatted}`;

    if (diffPaise === 0) {
      receiptDifference.textContent = `₹0.00 (EXACT)`;
      receiptDifference.className = 't-val text-balanced';
    } else {
      receiptDifference.textContent = `₹${diffFormatted} (VARIANCE)`;
      receiptDifference.className = 't-val text-variance';
    }

    // Reveal Guest Check & Hide Standby Leaf
    receiptPlaceholder.classList.add('hidden');
    billReceipt.classList.remove('hidden');

    currentSplitData = splitData;
  }

  /**
   * Save valid state to localStorage (Requirement 5)
   */
  function saveToStorage(splitData) {
    try {
      const state = {
        occasion: splitData.occasion,
        billAmount: splitData.billAmount,
        peopleCount: splitData.peopleCount,
        timestamp: splitData.timestamp,
        ref: splitData.ref
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (storageStatusText) {
        storageStatusText.textContent = `Persistence: Saved locally (${splitData.timestamp})`;
      }
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  /**
   * Clear saved state from localStorage
   */
  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (storageStatusText) {
        storageStatusText.textContent = 'Persistence: Memory cleared';
      }
    } catch (e) {
      console.warn('LocalStorage clear error:', e);
    }
  }

  /**
   * Load saved state from localStorage on page initialization
   */
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const state = JSON.parse(raw);
      if (state && state.occasion && state.billAmount && state.peopleCount) {
        occasionInput.value = state.occasion;
        billInput.value = state.billAmount;
        peopleInput.value = state.peopleCount;

        const splitData = calculateSplit(
          state.occasion,
          Number(state.billAmount),
          Number(state.peopleCount),
          state.timestamp,
          state.ref
        );

        renderReceipt(splitData);
        if (storageStatusText) {
          storageStatusText.textContent = `Persistence: Restored from previous session (${splitData.timestamp})`;
        }
      }
    } catch (e) {
      console.warn('LocalStorage restore error:', e);
    }
  }

  /**
   * Form Submit Event Handler
   */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const validData = validateInputs();
    if (!validData) return;

    const splitData = calculateSplit(
      validData.occasion,
      validData.billAmount,
      validData.peopleCount
    );

    renderReceipt(splitData);
    saveToStorage(splitData);
  });

  /**
   * Reset Button Event Handler
   */
  resetBtn.addEventListener('click', function () {
    form.reset();
    clearErrors();
    billReceipt.classList.add('hidden');
    receiptPlaceholder.classList.remove('hidden');
    currentSplitData = null;
    clearStorage();
    occasionInput.focus();
  });

  /**
   * Stepper Buttons (+ and -) for Number of Guests
   */
  incPeopleBtn.addEventListener('click', function () {
    const currentVal = parseInt(peopleInput.value, 10);
    const nextVal = (isNaN(currentVal) || currentVal < 1) ? 2 : currentVal + 1;
    peopleInput.value = nextVal;
    peopleInput.classList.remove('input-error');
  });

  decPeopleBtn.addEventListener('click', function () {
    const currentVal = parseInt(peopleInput.value, 10);
    if (isNaN(currentVal) || currentVal <= 1) {
      peopleInput.value = 1;
    } else {
      peopleInput.value = currentVal - 1;
    }
    peopleInput.classList.remove('input-error');
  });

  /**
   * Quick Preset Tabs
   */
  presetButtons.forEach((btn) => {
    btn.addEventListener('click', function () {
      const occasion = this.getAttribute('data-occasion');
      const bill = this.getAttribute('data-bill');
      const people = this.getAttribute('data-people');

      occasionInput.value = occasion;
      billInput.value = bill;
      peopleInput.value = people;

      clearErrors();

      const splitData = calculateSplit(occasion, Number(bill), Number(people));
      renderReceipt(splitData);
      saveToStorage(splitData);
    });
  });

  /**
   * Remove input errors on typing
   */
  [occasionInput, billInput, peopleInput].forEach((input) => {
    input.addEventListener('input', function () {
      if (this.classList.contains('input-error')) {
        this.classList.remove('input-error');
        if (!occasionInput.classList.contains('input-error') &&
            !billInput.classList.contains('input-error') &&
            !peopleInput.classList.contains('input-error')) {
          errorAlert.classList.add('hidden');
        }
      }
    });
  });

  /**
   * Copy Check Breakdown to Clipboard (No emojis)
   */
  copyBreakdownBtn.addEventListener('click', function () {
    if (!currentSplitData) return;

    let text = `OWE-ASIS — DINNER BILLFOLIO & SETTLEMENT\n`;
    text += `Occasion: ${currentSplitData.occasion}\n`;
    text += `Date: ${currentSplitData.timestamp}\n`;
    text += `Check Ref: ${currentSplitData.ref}\n`;
    text += `Total Invoice: ₹${(currentSplitData.totalPaise / 100).toFixed(2)}\n`;
    text += `Total Guests: ${currentSplitData.peopleCount}\n`;
    text += `----------------------------------------\n`;
    text += `ITEMIZED GUEST BREAKDOWN:\n`;

    currentSplitData.shares.forEach((item) => {
      text += `${item.label}: ₹${item.rupees}${item.hasExtraPaise ? ' (+1p balance)' : ''}\n`;
    });

    text += `----------------------------------------\n`;
    text += `Sum of Shares: ₹${(currentSplitData.cumulativeSumPaise / 100).toFixed(2)} (100.00% Exact)\n`;
    text += `Balanced down to the paise. No rounding loss.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const originalText = copyBtnText.textContent;
        copyBtnText.textContent = 'Check Copied';
        setTimeout(() => {
          copyBtnText.textContent = originalText;
        }, 2200);
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      const originalText = copyBtnText.textContent;
      copyBtnText.textContent = 'Check Copied';
      setTimeout(() => {
        copyBtnText.textContent = originalText;
      }, 2200);
    } catch (err) {
      console.warn('Copy fallback failed', err);
    }
    document.body.removeChild(textarea);
  }

  /**
   * Print Check Button Handler
   */
  if (printReceiptBtn) {
    printReceiptBtn.addEventListener('click', function (e) {
      e.preventDefault();
      // Ensure folio is fully open for clean printing
      openFolio();
      try {
        window.print();
      } catch (err) {
        console.warn('Direct print execution failed', err);
      }
    });
  }

  /**
   * App Initialization
   */
  function init() {
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    loadFromStorage();

    // Start with closed book on fresh refresh, then smoothly and gracefully swing open
    if (billBook) {
      billBook.classList.remove('book-open');
      billBook.classList.add('book-closed');
      if (toggleBookLabel) toggleBookLabel.textContent = 'Open Folio';
      
      openCoverTimer = setTimeout(() => {
        openFolio();
      }, 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
