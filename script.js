"use strict";

const STORAGE_KEY = "personal-expense-tracker.transactions.v1";
const CATEGORIES = new Set([
  "Allowance",
  "Salary",
  "Food",
  "Transport",
  "Education",
  "Entertainment",
  "Shopping",
  "Bills",
  "Healthcare",
  "Other"
]);

const form = document.querySelector("#transaction-form");
const typeInput = document.querySelector("#transaction-type");
const descriptionInput = document.querySelector("#description");
const amountInput = document.querySelector("#amount");
const categoryInput = document.querySelector("#category");
const dateInput = document.querySelector("#date");
const filterInput = document.querySelector("#type-filter");
const searchInput = document.querySelector("#search");
const transactionList = document.querySelector("#transaction-list");
const formMessage = document.querySelector("#form-message");
const statusMessage = document.querySelector("#status-message");
const successToast = document.querySelector("#success-toast");
const resultsSummary = document.querySelector("#results-summary");
const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let transactions = loadTransactions();
let successToastTimer = null;

function amountToCents(amount) {
  return Math.round(Number(amount) * 100);
}

function formatCurrency(amount) {
  const value = Number(amount);
  const sign = value < 0 ? "-" : "";
  return `${sign}LKR ${numberFormatter.format(Math.abs(value))}`;
}

function getTodayLocalDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  return parsedDate.getFullYear() === year
    && parsedDate.getMonth() === month - 1
    && parsedDate.getDate() === day;
}

function normalizeTransaction(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const amount = Number(item.amount);
  const cents = amountToCents(amount);
  const description = typeof item.description === "string" ? item.description.trim() : "";

  if (
    typeof item.id !== "string"
    || !item.id
    || !["income", "expense"].includes(item.type)
    || !description
    || !Number.isSafeInteger(cents)
    || cents <= 0
    || !CATEGORIES.has(item.category)
    || !isValidDate(item.date)
  ) {
    return null;
  }

  return {
    id: item.id,
    type: item.type,
    description,
    amount: cents / 100,
    category: item.category,
    date: item.date
  };
}

function loadTransactions() {
  try {
    const savedValue = localStorage.getItem(STORAGE_KEY);
    if (!savedValue) {
      return [];
    }

    const parsedValue = JSON.parse(savedValue);
    if (!Array.isArray(parsedValue)) {
      setStatus("Saved transaction data was invalid, so the ledger started empty.", true);
      return [];
    }

    const loaded = parsedValue.map(normalizeTransaction).filter(Boolean);
    if (loaded.length !== parsedValue.length) {
      setStatus("Some invalid saved entries were skipped.", true);
    }
    return loaded;
  } catch (error) {
    setStatus("Saved transactions could not be read in this browser.", true);
    return [];
  }
}

function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    return false;
  }
}

function createTransactionId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `transaction-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setFormMessage(message) {
  formMessage.textContent = message;
  formMessage.hidden = !message;
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function showSuccessToast() {
  window.clearTimeout(successToastTimer);
  successToast.classList.remove("is-visible");
  successToast.hidden = false;
  void successToast.offsetWidth;
  successToast.classList.add("is-visible");

  successToastTimer = window.setTimeout(() => {
    successToast.classList.remove("is-visible");
    successToast.hidden = true;
    successToastTimer = null;
  }, 2000);
}

function validateForm() {
  const description = descriptionInput.value.trim();
  const amount = Number(amountInput.value);
  const cents = amountToCents(amount);

  if (!description) {
    return { valid: false, message: "Enter a description for this transaction.", field: descriptionInput };
  }
  if (!amountInput.value || !Number.isFinite(amount) || !Number.isSafeInteger(cents) || cents <= 0) {
    return { valid: false, message: "Enter an amount greater than zero.", field: amountInput };
  }
  if (amountInput.validity.stepMismatch) {
    return { valid: false, message: "Enter an amount with no more than two decimal places.", field: amountInput };
  }
  if (!CATEGORIES.has(categoryInput.value)) {
    return { valid: false, message: "Choose a transaction category.", field: categoryInput };
  }
  if (!isValidDate(dateInput.value)) {
    return { valid: false, message: "Choose a valid transaction date.", field: dateInput };
  }

  return {
    valid: true,
    transaction: {
      id: createTransactionId(),
      type: typeInput.value,
      description,
      amount: cents / 100,
      category: categoryInput.value,
      date: dateInput.value
    }
  };
}

function addTransaction(event) {
  event.preventDefault();
  setFormMessage("");

  const result = validateForm();
  if (!result.valid) {
    setFormMessage(result.message);
    result.field.focus();
    return;
  }

  transactions.push(result.transaction);
  const saved = saveTransactions();
  renderTransactions();
  resetForm();
  setStatus(saved ? "Transaction added and saved." : "Transaction added for this session, but browser storage is unavailable.", !saved);
  showSuccessToast();
  alert("Transaction added successfully!");
}

function deleteTransaction(id) {
  const transaction = transactions.find((item) => item.id === id);
  if (!transaction || !window.confirm(`Delete "${transaction.description}" from your history?`)) {
    return;
  }

  transactions = transactions.filter((item) => item.id !== id);
  const saved = saveTransactions();
  renderTransactions();
  setStatus(saved ? "Transaction deleted." : "Transaction deleted for this session, but browser storage is unavailable.", !saved);
}

function calculateTotals() {
  return transactions.reduce((totals, transaction) => {
    const cents = amountToCents(transaction.amount);
    if (transaction.type === "income") {
      totals.income += cents;
    } else {
      totals.expenses += cents;
    }
    return totals;
  }, { income: 0, expenses: 0 });
}

function filterTransactions(items = transactions) {
  const selectedType = filterInput.value;
  return selectedType === "all" ? items : items.filter((item) => item.type === selectedType);
}

function searchTransactions(items = filterTransactions()) {
  const query = searchInput.value.trim().toLocaleLowerCase();
  if (!query) {
    return items;
  }

  return items.filter((item) => item.description.toLocaleLowerCase().includes(query)
    || item.category.toLocaleLowerCase().includes(query));
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function createCell(className, text) {
  const cell = document.createElement("td");
  if (className) {
    cell.className = className;
  }
  cell.textContent = text;
  return cell;
}

function createTransactionRow(transaction) {
  const row = document.createElement("tr");
  row.append(createCell("date-cell", formatDate(transaction.date)));
  row.append(createCell("description-cell", transaction.description));

  const typeCell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `type-badge ${transaction.type}`;
  badge.textContent = transaction.type === "income" ? "Income" : "Expense";
  typeCell.append(badge);
  row.append(typeCell);

  row.append(createCell("category-cell", transaction.category));

  const amountPrefix = transaction.type === "income" ? "+" : "-";
  row.append(createCell(`amount-cell ${transaction.type}`, `${amountPrefix}${formatCurrency(transaction.amount)}`));

  const actionCell = document.createElement("td");
  actionCell.className = "action-cell";
  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.dataset.transactionId = transaction.id;
  deleteButton.setAttribute("aria-label", `Delete transaction: ${transaction.description}`);
  deleteButton.textContent = "Delete";
  actionCell.append(deleteButton);
  row.append(actionCell);

  return row;
}

function renderTransactions() {
  const totals = calculateTotals();
  document.querySelector("#total-income").textContent = formatCurrency(totals.income / 100);
  document.querySelector("#total-expenses").textContent = formatCurrency(totals.expenses / 100);
  document.querySelector("#current-balance").textContent = formatCurrency((totals.income - totals.expenses) / 100);

  const displayedTransactions = searchTransactions()
    .slice()
    .sort((first, second) => second.date.localeCompare(first.date) || second.id.localeCompare(first.id));
  transactionList.replaceChildren();

  if (displayedTransactions.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "empty-cell";
    cell.colSpan = 6;
    const heading = document.createElement("strong");
    const detail = document.createElement("span");
    if (transactions.length === 0) {
      heading.textContent = "Your ledger is ready.";
      detail.textContent = "Add a transaction above to see it here.";
    } else {
      heading.textContent = "No matching transactions.";
      detail.textContent = "Try another search or change the selected filter.";
    }
    cell.append(heading, detail);
    row.append(cell);
    transactionList.append(row);
  } else {
    const rows = displayedTransactions.map(createTransactionRow);
    transactionList.append(...rows);
  }

  const count = displayedTransactions.length;
  resultsSummary.textContent = `${count} ${count === 1 ? "transaction" : "transactions"} shown.`;
}

function resetForm() {
  form.reset();
  dateInput.value = getTodayLocalDate();
  setFormMessage("");
}

form.addEventListener("submit", addTransaction);
document.querySelector("#clear-form").addEventListener("click", () => {
  resetForm();
  setStatus("Form cleared.");
});
filterInput.addEventListener("change", renderTransactions);
searchInput.addEventListener("input", renderTransactions);
transactionList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-transaction-id]");
  if (deleteButton) {
    deleteTransaction(deleteButton.dataset.transactionId);
  }
});

resetForm();
renderTransactions();