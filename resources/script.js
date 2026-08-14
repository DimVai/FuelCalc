(() => {
  'use strict';

  const FUEL_STORAGE_KEY = 'fuelcalc-fuel-state-v1';
  const TOLL_STORAGE_KEY = 'fuelcalc-toll-state-v1';

  const tabButtons = Array.from(document.querySelectorAll('[role="tab"]'));

  const fuelInitialPriceInput = document.getElementById('fuelInitialPrice');
  const fuelDistanceInput = document.getElementById('fuelDistance');
  const fuelConsumptionInput = document.getElementById('fuelConsumption');
  const fuelRefuelList = document.getElementById('fuelRefuelList');
  const fuelRefuelCount = document.getElementById('fuelRefuelCount');
  const fuelNoRefuelsHint = document.getElementById('fuelNoRefuelsHint');
  const fuelAddRefuelBtn = document.getElementById('fuelAddRefuelBtn');
  const fuelResetBtn = document.getElementById('fuelResetBtn');

  const fuelResultsHint = document.getElementById('fuelResultsHint');
  const fuelResults = document.getElementById('fuelResults');
  const fuelTripCostEl = document.getElementById('fuelTripCost');
  const fuelTripLitersEl = document.getElementById('fuelTripLiters');
  const fuelCostPer100El = document.getElementById('fuelCostPer100');
  const fuelRefuelTotalsEl = document.getElementById('fuelRefuelTotals');
  const fuelAveragePriceRow = document.getElementById('fuelAveragePriceRow');
  const fuelAveragePriceEl = document.getElementById('fuelAveragePrice');
  const fuelInitialFuelRow = document.getElementById('fuelInitialFuelRow');
  const fuelInitialFuelEl = document.getElementById('fuelInitialFuel');
  const fuelRemainingFuelRow = document.getElementById('fuelRemainingFuelRow');
  const fuelRemainingFuelEl = document.getElementById('fuelRemainingFuel');
  const fuelMethodNote = document.getElementById('fuelMethodNote');

  const tollInitialBalanceInput = document.getElementById('tollInitialBalance');
  const tollFinalBalanceInput = document.getElementById('tollFinalBalance');
  const tollTopUpList = document.getElementById('tollTopUpList');
  const tollTopUpCount = document.getElementById('tollTopUpCount');
  const tollNoTopUpsHint = document.getElementById('tollNoTopUpsHint');
  const tollAddTopUpBtn = document.getElementById('tollAddTopUpBtn');
  const tollResetBtn = document.getElementById('tollResetBtn');

  const tollResultsHint = document.getElementById('tollResultsHint');
  const tollResults = document.getElementById('tollResults');
  const tollCostEl = document.getElementById('tollCost');
  const tollInitialBalanceResult = document.getElementById('tollInitialBalanceResult');
  const tollTopUpTotal = document.getElementById('tollTopUpTotal');
  const tollFinalBalanceResult = document.getElementById('tollFinalBalanceResult');

  const numberFormatters = new Map();

  let fuelState = {
    initialPrice: '',
    distance: '',
    consumption: '',
    refuels: []
  };

  let tollState = {
    initialBalance: '',
    finalBalance: '',
    topUps: []
  };

  let nextFuelRefuelId = Date.now();
  let nextTollTopUpId = Date.now();
  let fuelResetTimer = null;
  let tollResetTimer = null;

  function activateTab(activeTab) {
    for (const tab of tabButtons) {
      const isActive = tab === activeTab;
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !isActive;
    }
  }

  tabButtons.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));

    tab.addEventListener('keydown', event => {
      let nextIndex;

      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabButtons.length - 1;
      if (nextIndex === undefined) return;

      event.preventDefault();
      activateTab(tabButtons[nextIndex]);
      tabButtons[nextIndex].focus();
    });
  });

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

  function formatFuelLiters(value) {
    return formatter(2, 2).format(value) + '\u00a0L';
  }

  function formatFuelPrice(value) {
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

  function parseNonNegativeDecimal(value) {
    if (value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function saveFuelState() {
    try {
      localStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify(fuelState));
    } catch (_) {
      // Η εφαρμογή συνεχίζει κανονικά αν η αποθήκευση δεν είναι διαθέσιμη.
    }
  }

  function loadFuelState() {
    try {
      const saved = JSON.parse(localStorage.getItem(FUEL_STORAGE_KEY));
      if (!saved || typeof saved !== 'object') return;

      fuelState.initialPrice = typeof saved.initialPrice === 'string' ? saved.initialPrice : '';
      fuelState.distance = typeof saved.distance === 'string' ? saved.distance : '';
      fuelState.consumption = typeof saved.consumption === 'string' ? saved.consumption : '';
      fuelState.refuels = Array.isArray(saved.refuels)
        ? saved.refuels
          .filter(refuel => refuel && typeof refuel === 'object')
          .map(refuel => ({
            id: Number.isFinite(refuel.id) ? refuel.id : nextFuelRefuelId++,
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
    });
  }

  function createFuelRefuelUnitField(refuel, key, unit, label, decimalPlaces) {
    const wrapper = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'unit-field' + (key === 'price' ? ' price' : '');

    const labelEl = document.createElement('label');
    const inputId = 'fuel-refuel-' + refuel.id + '-' + key;
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
      updateFuelRefuelLiters(refuel.id);
      saveFuelState();
      recalculateFuel();
    });

    const unitEl = document.createElement('span');
    unitEl.className = 'unit';
    unitEl.textContent = unit;

    field.append(input, unitEl);
    wrapper.append(labelEl, field);
    return wrapper;
  }

  function updateFuelRefuelLiters(id) {
    const refuel = fuelState.refuels.find(item => item.id === id);
    const output = document.querySelector('[data-liters-for="' + id + '"]');
    if (!refuel || !output) return;

    const amount = parseDecimal(refuel.amount);
    const price = parseDecimal(refuel.price);
    output.textContent = amount > 0 && price > 0 ? formatFuelLiters(amount / price) : '—';
  }

  function renderFuelRefuels(focusId) {
    fuelRefuelList.replaceChildren();

    fuelState.refuels.forEach((refuel, index) => {
      const item = document.createElement('article');
      item.className = 'entry-item';

      const heading = document.createElement('div');
      heading.className = 'entry-heading';

      const title = document.createElement('span');
      title.className = 'entry-title';
      title.textContent = 'Ανεφοδιασμός ' + (index + 1);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('aria-label', 'Διαγραφή ανεφοδιασμού ' + (index + 1));
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', () => {
        fuelState.refuels = fuelState.refuels.filter(item => item.id !== refuel.id);
        saveFuelState();
        renderFuelRefuels();
        recalculateFuel();
      });

      heading.append(title, deleteBtn);

      const fields = document.createElement('div');
      fields.className = 'refuel-fields';
      fields.append(
        createFuelRefuelUnitField(refuel, 'amount', '€', 'Ποσό', 2),
        createFuelRefuelUnitField(refuel, 'price', '€/L', 'Τιμή λίτρου', 3)
      );

      const liters = document.createElement('p');
      liters.className = 'refuel-liters';
      liters.append('Λίτρα που προστέθηκαν: ');
      const litersValue = document.createElement('strong');
      litersValue.dataset.litersFor = refuel.id;
      liters.append(litersValue);

      item.append(heading, fields, liters);
      fuelRefuelList.appendChild(item);
      updateFuelRefuelLiters(refuel.id);
    });

    const count = fuelState.refuels.length;
    fuelRefuelCount.textContent = count;
    fuelRefuelCount.hidden = count === 0;
    fuelNoRefuelsHint.hidden = count > 0;

    if (focusId !== undefined) {
      document.getElementById('fuel-refuel-' + focusId + '-amount')?.focus();
    }
  }

  function showFuelHint(message) {
    fuelResults.hidden = true;
    fuelResultsHint.textContent = message;
    fuelResultsHint.hidden = false;
  }

  function recalculateFuel() {
    const initialPrice = parseDecimal(fuelState.initialPrice);
    const distance = parseDecimal(fuelState.distance);
    const consumption = parseDecimal(fuelState.consumption);

    if (initialPrice <= 0) {
      showFuelHint('Συμπλήρωσε την αρχική τιμή καυσίμου.');
      return;
    }

    const refuels = [];
    for (const refuel of fuelState.refuels) {
      const amount = parseDecimal(refuel.amount);
      const price = parseDecimal(refuel.price);
      if (amount <= 0 || price <= 0) {
        showFuelHint('Συμπλήρωσε το ποσό και την τιμή σε κάθε ανεφοδιασμό ή διέγραψε την κενή εγγραφή.');
        return;
      }
      refuels.push({ amount, price, liters: amount / price });
    }

    if (distance <= 0 || consumption <= 0) {
      showFuelHint('Συμπλήρωσε την απόσταση και τη μέση κατανάλωση του ταξιδιού.');
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
      fuelMethodNote.textContent = 'Όλο το καύσιμο του ταξιδιού υπολογίστηκε με την αρχική τιμή, καθώς δεν καταχωρίστηκε ανεφοδιασμός.';
    } else if (tripLiters <= totalRefuelLiters) {
      tripCost = tripLiters * averageRefuelPrice;
      remainingRefuelLiters = totalRefuelLiters - tripLiters;
      fuelMethodNote.textContent = remainingRefuelLiters > 0
        ? 'Το κόστος υπολογίστηκε με τη σταθμισμένη μέση τιμή των ανεφοδιασμών. Το καύσιμο που περίσσεψε δεν χρεώθηκε στο ταξίδι.'
        : 'Τα λίτρα των ανεφοδιασμών κάλυψαν ακριβώς την κατανάλωση του ταξιδιού.';
    } else {
      initialFuelLiters = tripLiters - totalRefuelLiters;
      initialFuelCost = initialFuelLiters * initialPrice;
      tripCost = totalRefuelCost + initialFuelCost;
      fuelMethodNote.textContent = 'Υπολογίστηκε ολόκληρο το κόστος των ανεφοδιασμών και τα επιπλέον λίτρα χρεώθηκαν με την αρχική τιμή.';
    }

    fuelTripCostEl.textContent = formatMoney(tripCost);
    fuelTripLitersEl.textContent = formatFuelLiters(tripLiters);
    fuelCostPer100El.textContent = formatMoney(tripCost / distance * 100);
    fuelRefuelTotalsEl.textContent = formatFuelLiters(totalRefuelLiters) + ' · ' + formatMoney(totalRefuelCost);

    fuelAveragePriceRow.hidden = totalRefuelLiters === 0;
    fuelAveragePriceEl.textContent = totalRefuelLiters > 0 ? formatFuelPrice(averageRefuelPrice) : '—';

    fuelInitialFuelRow.hidden = initialFuelLiters === 0;
    fuelInitialFuelEl.textContent = formatFuelLiters(initialFuelLiters) + ' · ' + formatMoney(initialFuelCost);

    fuelRemainingFuelRow.hidden = remainingRefuelLiters <= 0;
    fuelRemainingFuelEl.textContent = formatFuelLiters(remainingRefuelLiters);

    fuelResultsHint.hidden = true;
    fuelResults.hidden = false;
  }

  function resetFuelCalculator() {
    fuelState = {
      initialPrice: '',
      distance: '',
      consumption: '',
      refuels: []
    };

    fuelInitialPriceInput.value = '';
    fuelDistanceInput.value = '';
    fuelConsumptionInput.value = '';
    fuelResetBtn.classList.remove('armed');
    fuelResetBtn.textContent = 'Νέο ταξίδι';
    saveFuelState();
    renderFuelRefuels();
    recalculateFuel();
    fuelInitialPriceInput.focus();
  }

  function saveTollState() {
    try {
      localStorage.setItem(TOLL_STORAGE_KEY, JSON.stringify(tollState));
    } catch (_) {
      // Η εφαρμογή συνεχίζει κανονικά αν η αποθήκευση δεν είναι διαθέσιμη.
    }
  }

  function loadTollState() {
    try {
      const saved = JSON.parse(localStorage.getItem(TOLL_STORAGE_KEY));
      if (!saved || typeof saved !== 'object') return;

      tollState.initialBalance = typeof saved.initialBalance === 'string' ? saved.initialBalance : '';
      tollState.finalBalance = typeof saved.finalBalance === 'string' ? saved.finalBalance : '';
      tollState.topUps = Array.isArray(saved.topUps)
        ? saved.topUps
          .filter(topUp => topUp && typeof topUp === 'object')
          .map(topUp => ({
            id: Number.isFinite(topUp.id) ? topUp.id : nextTollTopUpId++,
            amount: typeof topUp.amount === 'string' ? topUp.amount : ''
          }))
        : [];
    } catch (_) {
      // Αγνοείται μη έγκυρο αποθηκευμένο περιεχόμενο.
    }
  }

  function renderTollTopUps(focusId) {
    tollTopUpList.replaceChildren();

    tollState.topUps.forEach((topUp, index) => {
      const item = document.createElement('article');
      item.className = 'entry-item';

      const heading = document.createElement('div');
      heading.className = 'entry-heading';

      const inputId = 'toll-top-up-' + topUp.id + '-amount';
      const labelEl = document.createElement('label');
      labelEl.className = 'entry-title';
      labelEl.htmlFor = inputId;
      labelEl.textContent = 'Ανατροφοδότηση ' + (index + 1);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('aria-label', 'Διαγραφή ανατροφοδότησης ' + (index + 1));
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', () => {
        tollState.topUps = tollState.topUps.filter(item => item.id !== topUp.id);
        saveTollState();
        renderTollTopUps();
        recalculateTolls();
      });

      heading.append(labelEl, deleteBtn);

      const field = document.createElement('div');
      field.className = 'unit-field';

      const input = document.createElement('input');
      input.id = inputId;
      input.className = 'input';
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.maxLength = 10;
      input.placeholder = '0,00';
      input.value = topUp.amount;
      bindDecimalInput(input, 2, value => {
        topUp.amount = value;
        saveTollState();
        recalculateTolls();
      });

      const unitEl = document.createElement('span');
      unitEl.className = 'unit';
      unitEl.textContent = '€';

      field.append(input, unitEl);
      item.append(heading, field);
      tollTopUpList.appendChild(item);
    });

    const count = tollState.topUps.length;
    tollTopUpCount.textContent = count;
    tollTopUpCount.hidden = count === 0;
    tollNoTopUpsHint.hidden = count > 0;

    if (focusId !== undefined) {
      document.getElementById('toll-top-up-' + focusId + '-amount')?.focus();
    }
  }

  function showTollHint(message) {
    tollResults.hidden = true;
    tollResultsHint.textContent = message;
    tollResultsHint.hidden = false;
  }

  function recalculateTolls() {
    const initialBalance = parseNonNegativeDecimal(tollState.initialBalance);
    if (initialBalance === null) {
      showTollHint('Συμπλήρωσε το αρχικό υπόλοιπο e-pass.');
      return;
    }

    const topUpAmounts = [];
    for (const topUp of tollState.topUps) {
      const amount = parseDecimal(topUp.amount);
      if (amount <= 0) {
        showTollHint('Συμπλήρωσε το ποσό σε κάθε ανατροφοδότηση ή διέγραψε την κενή εγγραφή.');
        return;
      }
      topUpAmounts.push(amount);
    }

    const finalBalance = parseNonNegativeDecimal(tollState.finalBalance);
    if (finalBalance === null) {
      showTollHint('Συμπλήρωσε το τελικό υπόλοιπο e-pass.');
      return;
    }

    const totalTopUps = topUpAmounts.reduce((sum, amount) => sum + amount, 0);
    const availableBalance = initialBalance + totalTopUps;
    if (finalBalance > availableBalance) {
      showTollHint('Το τελικό υπόλοιπο δεν μπορεί να είναι μεγαλύτερο από το αρχικό υπόλοιπο και τις ανατροφοδοτήσεις μαζί.');
      return;
    }

    const tollCost = availableBalance - finalBalance;
    tollCostEl.textContent = formatMoney(tollCost);
    tollInitialBalanceResult.textContent = formatMoney(initialBalance);
    tollTopUpTotal.textContent = formatMoney(totalTopUps);
    tollFinalBalanceResult.textContent = formatMoney(finalBalance);
    tollResultsHint.hidden = true;
    tollResults.hidden = false;
  }

  function resetTollCalculator() {
    tollState = {
      initialBalance: '',
      finalBalance: '',
      topUps: []
    };

    tollInitialBalanceInput.value = '';
    tollFinalBalanceInput.value = '';
    tollResetBtn.classList.remove('armed');
    tollResetBtn.textContent = 'Νέο ταξίδι';
    saveTollState();
    renderTollTopUps();
    recalculateTolls();
    tollInitialBalanceInput.focus();
  }

  bindDecimalInput(fuelInitialPriceInput, 3, value => {
    fuelState.initialPrice = value;
    saveFuelState();
    recalculateFuel();
  });

  bindDecimalInput(fuelDistanceInput, 2, value => {
    fuelState.distance = value;
    saveFuelState();
    recalculateFuel();
  });

  bindDecimalInput(fuelConsumptionInput, 2, value => {
    fuelState.consumption = value;
    saveFuelState();
    recalculateFuel();
  });

  fuelAddRefuelBtn.addEventListener('click', () => {
    const refuel = { id: nextFuelRefuelId++, amount: '', price: '' };
    fuelState.refuels.push(refuel);
    saveFuelState();
    renderFuelRefuels(refuel.id);
    recalculateFuel();
  });

  fuelResetBtn.addEventListener('click', () => {
    if (!fuelResetBtn.classList.contains('armed')) {
      fuelResetBtn.classList.add('armed');
      fuelResetBtn.textContent = 'Επιβεβαίωση';
      clearTimeout(fuelResetTimer);
      fuelResetTimer = setTimeout(() => {
        fuelResetBtn.classList.remove('armed');
        fuelResetBtn.textContent = 'Νέο ταξίδι';
      }, 2500);
      return;
    }

    clearTimeout(fuelResetTimer);
    resetFuelCalculator();
  });

  bindDecimalInput(tollInitialBalanceInput, 2, value => {
    tollState.initialBalance = value;
    saveTollState();
    recalculateTolls();
  });

  bindDecimalInput(tollFinalBalanceInput, 2, value => {
    tollState.finalBalance = value;
    saveTollState();
    recalculateTolls();
  });

  tollAddTopUpBtn.addEventListener('click', () => {
    const topUp = { id: nextTollTopUpId++, amount: '' };
    tollState.topUps.push(topUp);
    saveTollState();
    renderTollTopUps(topUp.id);
    recalculateTolls();
  });

  tollResetBtn.addEventListener('click', () => {
    if (!tollResetBtn.classList.contains('armed')) {
      tollResetBtn.classList.add('armed');
      tollResetBtn.textContent = 'Επιβεβαίωση';
      clearTimeout(tollResetTimer);
      tollResetTimer = setTimeout(() => {
        tollResetBtn.classList.remove('armed');
        tollResetBtn.textContent = 'Νέο ταξίδι';
      }, 2500);
      return;
    }

    clearTimeout(tollResetTimer);
    resetTollCalculator();
  });

  loadFuelState();
  fuelInitialPriceInput.value = fuelState.initialPrice;
  fuelDistanceInput.value = fuelState.distance;
  fuelConsumptionInput.value = fuelState.consumption;
  renderFuelRefuels();
  recalculateFuel();

  loadTollState();
  tollInitialBalanceInput.value = tollState.initialBalance;
  tollFinalBalanceInput.value = tollState.finalBalance;
  renderTollTopUps();
  recalculateTolls();
})();
