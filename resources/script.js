(() => {
  'use strict';

  const STORAGE_KEY = 'fuelcalc-state-v1';

  const initialPriceInput = document.getElementById('initialPrice');
  const distanceInput = document.getElementById('distance');
  const consumptionInput = document.getElementById('consumption');
  const refuelList = document.getElementById('refuelList');
  const refuelCount = document.getElementById('refuelCount');
  const noRefuelsHint = document.getElementById('noRefuelsHint');
  const addRefuelBtn = document.getElementById('addRefuelBtn');
  const resetBtn = document.getElementById('resetBtn');

  const resultsHint = document.getElementById('resultsHint');
  const results = document.getElementById('results');
  const tripCostEl = document.getElementById('tripCost');
  const tripLitersEl = document.getElementById('tripLiters');
  const costPer100El = document.getElementById('costPer100');
  const refuelTotalsEl = document.getElementById('refuelTotals');
  const averagePriceRow = document.getElementById('averagePriceRow');
  const averagePriceEl = document.getElementById('averagePrice');
  const initialFuelRow = document.getElementById('initialFuelRow');
  const initialFuelEl = document.getElementById('initialFuel');
  const remainingFuelRow = document.getElementById('remainingFuelRow');
  const remainingFuelEl = document.getElementById('remainingFuel');
  const methodNote = document.getElementById('methodNote');

  const numberFormatters = new Map();

  let state = {
    initialPrice: '',
    distance: '',
    consumption: '',
    refuels: []
  };

  let nextRefuelId = Date.now();
  let resetTimer = null;

  function formatter(minimumFractionDigits, maximumFractionDigits) {
    const key = minimumFractionDigits + '-' + maximumFractionDigits;
    if (!numberFormatters.has(key)) {
      numberFormatters.set(key, new Intl.NumberFormat('el-GR', {
        minimumFractionDigits,
        maximumFractionDigits
      }));
    }
    return numberFormatters.get(key);
  }

  function formatMoney(value) {
    return formatter(2, 2).format(value) + '\u00a0€';
  }

  function formatLiters(value) {
    return formatter(2, 2).format(value) + '\u00a0L';
  }

  function formatPrice(value) {
    return formatter(3, 3).format(value) + '\u00a0€/L';
  }

  function sanitizeDecimal(value, decimalPlaces) {
    const cleaned = String(value).replace(/[^0-9.,]/g, '');
    const separatorIndex = cleaned.search(/[.,]/);

    if (separatorIndex === -1) return cleaned;

    const integerPart = cleaned.slice(0, separatorIndex) || '0';
    const separator = cleaned[separatorIndex];
    const fractionPart = cleaned.slice(separatorIndex + 1).replace(/[.,]/g, '').slice(0, decimalPlaces);
    return integerPart + separator + fractionPart;
  }

  function parseDecimal(value) {
    if (!value) return 0;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Η εφαρμογή συνεχίζει κανονικά αν η αποθήκευση δεν είναι διαθέσιμη.
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== 'object') return;

      state.initialPrice = typeof saved.initialPrice === 'string' ? saved.initialPrice : '';
      state.distance = typeof saved.distance === 'string' ? saved.distance : '';
      state.consumption = typeof saved.consumption === 'string' ? saved.consumption : '';
      state.refuels = Array.isArray(saved.refuels)
        ? saved.refuels
          .filter(refuel => refuel && typeof refuel === 'object')
          .map(refuel => ({
            id: Number.isFinite(refuel.id) ? refuel.id : nextRefuelId++,
            amount: typeof refuel.amount === 'string' ? refuel.amount : '',
            price: typeof refuel.price === 'string' ? refuel.price : ''
          }))
        : [];
    } catch (_) {
      // Αγνοείται μη έγκυρο αποθηκευμένο περιεχόμενο.
    }
  }

  function bindDecimalInput(input, decimalPlaces, onChange) {
    input.addEventListener('input', () => {
      const sanitized = sanitizeDecimal(input.value, decimalPlaces);
      if (input.value !== sanitized) input.value = sanitized;
      onChange(sanitized);
      saveState();
      recalculate();
    });
  }

  function createUnitField(refuel, key, unit, label, decimalPlaces) {
    const wrapper = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'unit-field' + (key === 'price' ? ' price' : '');

    const labelEl = document.createElement('label');
    const inputId = 'refuel-' + refuel.id + '-' + key;
    labelEl.htmlFor = inputId;
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.id = inputId;
    input.className = 'input';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.maxLength = key === 'amount' ? 10 : 7;
    input.placeholder = key === 'amount' ? '0,00' : '0,000';
    input.value = refuel[key];
    bindDecimalInput(input, decimalPlaces, value => {
      refuel[key] = value;
      updateRefuelLiters(refuel.id);
    });

    const unitEl = document.createElement('span');
    unitEl.className = 'unit';
    unitEl.textContent = unit;

    field.append(input, unitEl);
    wrapper.append(labelEl, field);
    return wrapper;
  }

  function updateRefuelLiters(id) {
    const refuel = state.refuels.find(item => item.id === id);
    const output = document.querySelector('[data-liters-for="' + id + '"]');
    if (!refuel || !output) return;

    const amount = parseDecimal(refuel.amount);
    const price = parseDecimal(refuel.price);
    output.textContent = amount > 0 && price > 0 ? formatLiters(amount / price) : '—';
  }

  function renderRefuels(focusId) {
    refuelList.replaceChildren();

    state.refuels.forEach((refuel, index) => {
      const item = document.createElement('article');
      item.className = 'refuel-item';

      const heading = document.createElement('div');
      heading.className = 'refuel-heading';

      const title = document.createElement('span');
      title.className = 'refuel-title';
      title.textContent = 'Ανεφοδιασμός ' + (index + 1);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('aria-label', 'Διαγραφή ανεφοδιασμού ' + (index + 1));
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', () => {
        state.refuels = state.refuels.filter(item => item.id !== refuel.id);
        saveState();
        renderRefuels();
        recalculate();
      });

      heading.append(title, deleteBtn);

      const fields = document.createElement('div');
      fields.className = 'refuel-fields';
      fields.append(
        createUnitField(refuel, 'amount', '€', 'Ποσό', 2),
        createUnitField(refuel, 'price', '€/L', 'Τιμή λίτρου', 3)
      );

      const liters = document.createElement('p');
      liters.className = 'refuel-liters';
      liters.append('Λίτρα που προστέθηκαν: ');
      const litersValue = document.createElement('strong');
      litersValue.dataset.litersFor = refuel.id;
      liters.append(litersValue);

      item.append(heading, fields, liters);
      refuelList.appendChild(item);
      updateRefuelLiters(refuel.id);
    });

    const count = state.refuels.length;
    refuelCount.textContent = count;
    refuelCount.hidden = count === 0;
    noRefuelsHint.hidden = count > 0;

    if (focusId !== undefined) {
      document.getElementById('refuel-' + focusId + '-amount')?.focus();
    }
  }

  function showHint(message) {
    results.hidden = true;
    resultsHint.textContent = message;
    resultsHint.hidden = false;
  }

  function recalculate() {
    const initialPrice = parseDecimal(state.initialPrice);
    const distance = parseDecimal(state.distance);
    const consumption = parseDecimal(state.consumption);

    if (initialPrice <= 0) {
      showHint('Συμπλήρωσε την αρχική τιμή καυσίμου.');
      return;
    }

    const refuels = [];
    for (const refuel of state.refuels) {
      const amount = parseDecimal(refuel.amount);
      const price = parseDecimal(refuel.price);
      if (amount <= 0 || price <= 0) {
        showHint('Συμπλήρωσε το ποσό και την τιμή σε κάθε ανεφοδιασμό ή διέγραψε την κενή εγγραφή.');
        return;
      }
      refuels.push({ amount, price, liters: amount / price });
    }

    if (distance <= 0 || consumption <= 0) {
      showHint('Συμπλήρωσε την απόσταση και τη μέση κατανάλωση του ταξιδιού.');
      return;
    }

    const tripLiters = distance * consumption / 100;
    const totalRefuelCost = refuels.reduce((sum, refuel) => sum + refuel.amount, 0);
    const totalRefuelLiters = refuels.reduce((sum, refuel) => sum + refuel.liters, 0);
    const averageRefuelPrice = totalRefuelLiters > 0 ? totalRefuelCost / totalRefuelLiters : 0;

    let tripCost;
    let initialFuelLiters = 0;
    let initialFuelCost = 0;
    let remainingRefuelLiters = 0;

    if (totalRefuelLiters === 0) {
      initialFuelLiters = tripLiters;
      initialFuelCost = tripLiters * initialPrice;
      tripCost = initialFuelCost;
      methodNote.textContent = 'Όλο το καύσιμο του ταξιδιού υπολογίστηκε με την αρχική τιμή, καθώς δεν καταχωρίστηκε ανεφοδιασμός.';
    } else if (tripLiters <= totalRefuelLiters) {
      tripCost = tripLiters * averageRefuelPrice;
      remainingRefuelLiters = totalRefuelLiters - tripLiters;
      methodNote.textContent = remainingRefuelLiters > 0
        ? 'Το κόστος υπολογίστηκε με τη σταθμισμένη μέση τιμή των ανεφοδιασμών. Το καύσιμο που περίσσεψε δεν χρεώθηκε στο ταξίδι.'
        : 'Τα λίτρα των ανεφοδιασμών κάλυψαν ακριβώς την κατανάλωση του ταξιδιού.';
    } else {
      initialFuelLiters = tripLiters - totalRefuelLiters;
      initialFuelCost = initialFuelLiters * initialPrice;
      tripCost = totalRefuelCost + initialFuelCost;
      methodNote.textContent = 'Υπολογίστηκε ολόκληρο το κόστος των ανεφοδιασμών και τα επιπλέον λίτρα χρεώθηκαν με την αρχική τιμή.';
    }

    tripCostEl.textContent = formatMoney(tripCost);
    tripLitersEl.textContent = formatLiters(tripLiters);
    costPer100El.textContent = formatMoney(tripCost / distance * 100);
    refuelTotalsEl.textContent = formatLiters(totalRefuelLiters) + ' · ' + formatMoney(totalRefuelCost);

    averagePriceRow.hidden = totalRefuelLiters === 0;
    averagePriceEl.textContent = totalRefuelLiters > 0 ? formatPrice(averageRefuelPrice) : '—';

    initialFuelRow.hidden = initialFuelLiters === 0;
    initialFuelEl.textContent = formatLiters(initialFuelLiters) + ' · ' + formatMoney(initialFuelCost);

    remainingFuelRow.hidden = remainingRefuelLiters <= 0;
    remainingFuelEl.textContent = formatLiters(remainingRefuelLiters);

    resultsHint.hidden = true;
    results.hidden = false;
  }

  function resetApplication() {
    state = {
      initialPrice: '',
      distance: '',
      consumption: '',
      refuels: []
    };

    initialPriceInput.value = '';
    distanceInput.value = '';
    consumptionInput.value = '';
    resetBtn.classList.remove('armed');
    resetBtn.textContent = 'Νέο ταξίδι';
    saveState();
    renderRefuels();
    recalculate();
    initialPriceInput.focus();
  }

  bindDecimalInput(initialPriceInput, 3, value => {
    state.initialPrice = value;
  });

  bindDecimalInput(distanceInput, 2, value => {
    state.distance = value;
  });

  bindDecimalInput(consumptionInput, 2, value => {
    state.consumption = value;
  });

  addRefuelBtn.addEventListener('click', () => {
    const refuel = { id: nextRefuelId++, amount: '', price: '' };
    state.refuels.push(refuel);
    saveState();
    renderRefuels(refuel.id);
    recalculate();
  });

  resetBtn.addEventListener('click', () => {
    if (!resetBtn.classList.contains('armed')) {
      resetBtn.classList.add('armed');
      resetBtn.textContent = 'Επιβεβαίωση';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        resetBtn.classList.remove('armed');
        resetBtn.textContent = 'Νέο ταξίδι';
      }, 2500);
      return;
    }

    clearTimeout(resetTimer);
    resetApplication();
  });

  loadState();
  initialPriceInput.value = state.initialPrice;
  distanceInput.value = state.distance;
  consumptionInput.value = state.consumption;
  renderRefuels();
  recalculate();
})();
