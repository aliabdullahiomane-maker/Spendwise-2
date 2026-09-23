import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyB3LE2hU3sP1QzGCk_qNrO-mBYCbbF8hFk",
  authDomain: "spendwise-6f350.firebaseapp.com",
  projectId: "spendwise-6f350",
  storageBucket: "spendwise-6f350.firebasestorage.app",
  messagingSenderId: "795878961117",
  appId: "1:795878961117:web:1e5786b82c52b49e849034",
  measurementId: "G-SZ8RCDKBWF"
};


const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();


const loginScreen =
  document.getElementById("login-screen");

const appElement =
  document.getElementById("app");

const googleLoginButton =
  document.getElementById("google-login-button");

const logoutButton =
  document.getElementById("logout-button");

const authMessage =
  document.getElementById("auth-message");

const userName =
  document.getElementById("user-name");

const userEmail =
  document.getElementById("user-email");

const userPhoto =
  document.getElementById("user-photo");

const incomeForm =
  document.getElementById("income-form");

const incomeInput =
  document.getElementById("income-input");

const expenseForm =
  document.getElementById("expense-form");

const expenseNameInput =
  document.getElementById("expense-name");

const expenseAmountInput =
  document.getElementById("expense-amount");

const totalIncomeDisplay =
  document.getElementById("total-income-display");

const totalExpensesDisplay =
  document.getElementById("total-expenses-display");

const remainingBalanceDisplay =
  document.getElementById("remaining-balance-display");

const budgetStatus =
  document.getElementById("budget-status");

const expensesListElement =
  document.getElementById("expenses-list");

const expenseCount =
  document.getElementById("expense-count");

const themeSelect =
  document.getElementById("theme-select");

const settingsButton =
  document.getElementById("settings-button");

const emailReminderButton =
  document.getElementById("email-reminder-button");

const copyrightYear =
  document.getElementById("copyright-year");

const phoneNumberInput =
  document.getElementById("phone-number");

const verificationCodeInput =
  document.getElementById("verification-code");

const sendCodeButton =
  document.getElementById("send-code-button");

const verifyCodeButton =
  document.getElementById("verify-code-button");

const phoneMessage =
  document.getElementById("phone-message");

const recaptchaContainer =
  document.getElementById("recaptcha-container");


let currentUser = null;
let unsubscribeExpenses = null;
let monthlyIncome = 0;
let expenses = [];
let recaptchaVerifier = null;
let phoneConfirmationResult = null;


const currencyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  currencyDisplay: "code",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});


function formatCurrency(amount) {
  return currencyFormatter.format(Number(amount) || 0);
}


function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}


function setMessage(element, message, isError = false) {
  if (!element) {
    return;
  }

  element.textContent = message;

  element.style.color = isError
    ? "var(--danger)"
    : "var(--success)";
}


function showLoginScreen() {
  if (loginScreen) {
    loginScreen.classList.remove("hidden");
  }

  if (appElement) {
    appElement.classList.add("hidden");
  }
}


function showApp() {
  if (loginScreen) {
    loginScreen.classList.add("hidden");
  }

  if (appElement) {
    appElement.classList.remove("hidden");
  }
}


function displayAuthError(error) {
  console.error("Authentication error:", error);

  if (!authMessage) {
    return;
  }

  switch (error.code) {
    case "auth/popup-closed-by-user":
      authMessage.textContent =
        "The sign-in window was closed.";
      break;

    case "auth/popup-blocked":
      authMessage.textContent =
        "Your browser blocked the login popup.";
      break;

    case "auth/unauthorized-domain":
      authMessage.textContent =
        "This website domain is not authorized in Firebase.";
      break;

    case "auth/operation-not-allowed":
      authMessage.textContent =
        "Google sign-in is not enabled in Firebase.";
      break;

    case "auth/configuration-not-found":
      authMessage.textContent =
        "Firebase Authentication is not configured.";
      break;

    default:
      authMessage.textContent =
        `${error.code || "Error"}: ${
          error.message || "Unable to sign in."
        }`;
  }
}


async function loginWithGoogle() {
  if (!googleLoginButton) {
    return;
  }

  if (authMessage) {
    authMessage.textContent = "";
  }

  googleLoginButton.disabled = true;
  googleLoginButton.textContent =
    "Opening Google login...";

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    displayAuthError(error);
  } finally {
    googleLoginButton.disabled = false;

    googleLoginButton.innerHTML = `
      <span class="google-icon">G</span>
      Continue with Gmail
    `;
  }
}


async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
    alert("Logout failed. Please try again.");
  }
}


function setupRecaptcha() {
  if (!sendCodeButton || !recaptchaContainer) {
    return;
  }

  if (recaptchaVerifier) {
    return;
  }

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    recaptchaContainer,
    {
      size: "normal",

      callback: () => {
        setMessage(
          phoneMessage,
          "Verification completed."
        );
      },

      "expired-callback": () => {
        setMessage(
          phoneMessage,
          "reCAPTCHA expired. Please try again.",
          true
        );
      }
    }
  );

  recaptchaVerifier.render().catch((error) => {
    console.error(
      "reCAPTCHA could not render:",
      error
    );
  });
}


async function sendPhoneCode() {
  if (!phoneNumberInput || !sendCodeButton) {
    return;
  }

  const phoneNumber =
    phoneNumberInput.value.trim();

  if (!/^\+254\d{9}$/.test(phoneNumber)) {
    setMessage(
      phoneMessage,
      "Use Kenyan format, for example +254712345678.",
      true
    );

    return;
  }

  try {
    setupRecaptcha();

    if (!recaptchaVerifier) {
      throw new Error(
        "reCAPTCHA could not be initialized."
      );
    }

    sendCodeButton.disabled = true;
    sendCodeButton.textContent =
      "Sending code...";

    phoneConfirmationResult =
      await signInWithPhoneNumber(
        auth,
        phoneNumber,
        recaptchaVerifier
      );

    setMessage(
      phoneMessage,
      "Verification code sent. Check your phone."
    );
  } catch (error) {
    console.error("Phone sign-in error:", error);

    setMessage(
      phoneMessage,
      `${error.code || "Error"}: ${
        error.message || "Unable to send SMS."
      }`,
      true
    );

    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
  } finally {
    sendCodeButton.disabled = false;
    sendCodeButton.textContent =
      "Send verification code";
  }
}


async function verifyPhoneCode() {
  if (!verificationCodeInput || !verifyCodeButton) {
    return;
  }

  const verificationCode =
    verificationCodeInput.value.trim();

  if (!phoneConfirmationResult) {
    setMessage(
      phoneMessage,
      "Request a verification code first.",
      true
    );

    return;
  }

  if (!/^\d{6}$/.test(verificationCode)) {
    setMessage(
      phoneMessage,
      "Enter the 6-digit verification code.",
      true
    );

    return;
  }

  try {
    verifyCodeButton.disabled = true;
    verifyCodeButton.textContent =
      "Verifying...";

    await phoneConfirmationResult.confirm(
      verificationCode
    );

    phoneConfirmationResult = null;

    setMessage(
      phoneMessage,
      "Phone number verified successfully."
    );
  } catch (error) {
    console.error(
      "Code verification error:",
      error
    );

    setMessage(
      phoneMessage,
      "The verification code is incorrect or expired.",
      true
    );
  } finally {
    verifyCodeButton.disabled = false;
    verifyCodeButton.textContent =
      "Verify phone number";
  }
}


function getExpenseCollection() {
  if (!currentUser) {
    throw new Error("No authenticated user.");
  }

  return collection(
    db,
    "users",
    currentUser.uid,
    "expenses"
  );
}


function getIncomeDocument() {
  if (!currentUser) {
    throw new Error("No authenticated user.");
  }

  return doc(
    db,
    "users",
    currentUser.uid,
    "settings",
    "finance"
  );
}


async function saveIncome() {
  if (!incomeInput) {
    return;
  }

  const amount =
    Number.parseFloat(incomeInput.value);

  if (!Number.isFinite(amount) || amount < 0) {
    alert("Please enter a valid income amount.");
    return;
  }

  monthlyIncome = amount;

  await setDoc(getIncomeDocument(), {
    monthlyIncome: monthlyIncome,
    currency: "KES",
    updatedAt: serverTimestamp()
  });

  incomeInput.value = "";
  updateDashboard();
}


async function addExpense() {
  if (!expenseNameInput || !expenseAmountInput) {
    return;
  }

  const name =
    expenseNameInput.value.trim();

  const amount =
    Number.parseFloat(expenseAmountInput.value);

  if (!name) {
    alert("Please enter an expense name.");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Please enter a valid expense amount.");
    return;
  }

  const expiryDate = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  await addDoc(getExpenseCollection(), {
    name: name,
    amount: amount,
    currency: "KES",
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiryDate)
  });

  expenseNameInput.value = "";
  expenseAmountInput.value = "";
}


async function removeExpense(expenseId) {
  if (!expenseId) {
    return;
  }

  await deleteDoc(
    doc(getExpenseCollection(), expenseId)
  );
}


function getTimestampMilliseconds(timestamp) {
  if (
    timestamp &&
    typeof timestamp.toMillis === "function"
  ) {
    return timestamp.toMillis();
  }

  return 0;
}


function getFirestoreErrorMessage(error) {
  if (error && error.code === "permission-denied") {
    return "Access denied. Check your Firestore rules.";
  }

  if (error && error.code === "failed-precondition") {
    return "Firestore needs an index. Check the browser console.";
  }

  if (error && error.code === "unavailable") {
    return "Firebase is temporarily unavailable.";
  }

  return "Check your Firestore database and security rules.";
}


function showExpenseError(error) {
  console.error("Could not load expenses:", error);

  if (!expensesListElement) {
    return;
  }

  expensesListElement.innerHTML = `
    <div class="empty-state">
      <h3>Unable to load expenses</h3>
      <p>
        ${escapeHTML(getFirestoreErrorMessage(error))}
      </p>
    </div>
  `;
}


function subscribeToExpenses() {
  if (unsubscribeExpenses) {
    unsubscribeExpenses();
    unsubscribeExpenses = null;
  }

  const expensesQuery = query(
    getExpenseCollection(),
    where(
      "expiresAt",
      ">",
      Timestamp.now()
    ),
    orderBy("expiresAt", "asc")
  );

  unsubscribeExpenses = onSnapshot(
    expensesQuery,

    (snapshot) => {
      expenses = snapshot.docs.map(
        (expenseDocument) => ({
          id: expenseDocument.id,
          ...expenseDocument.data()
        })
      );

      updateDashboard();
    },

    (error) => {
      console.error(
        "Expense loading error:",
        error
      );

      if (
        error.code === "failed-precondition" ||
        error.message?.toLowerCase().includes("index")
      ) {
        subscribeToExpensesWithoutOrdering();
      } else {
        showExpenseError(error);
      }
    }
  );
}


function subscribeToExpensesWithoutOrdering() {
  if (unsubscribeExpenses) {
    unsubscribeExpenses();
    unsubscribeExpenses = null;
  }

  const fallbackQuery = query(
    getExpenseCollection(),
    where(
      "expiresAt",
      ">",
      Timestamp.now()
    )
  );

  unsubscribeExpenses = onSnapshot(
    fallbackQuery,

    (snapshot) => {
      expenses = snapshot.docs
        .map((expenseDocument) => ({
          id: expenseDocument.id,
          ...expenseDocument.data()
        }))
        .sort((firstExpense, secondExpense) => {
          return (
            getTimestampMilliseconds(
              firstExpense.expiresAt
            ) -
            getTimestampMilliseconds(
              secondExpense.expiresAt
            )
          );
        });

      updateDashboard();
    },

    (error) => {
      showExpenseError(error);
    }
  );
}


function calculateTotalExpenses() {
  return expenses.reduce((total, expense) => {
    return total + Number(expense.amount || 0);
  }, 0);
}


function updateBudgetStatus(remainingBalance) {
  if (!budgetStatus) {
    return;
  }

  budgetStatus.className =
    "status-banner";

  if (monthlyIncome === 0) {
    budgetStatus.textContent =
      "Set your income and add expenses to view your budget health.";

    budgetStatus.classList.add("info");
  } else if (remainingBalance >= 0) {
    budgetStatus.textContent =
      `You are within budget with ${formatCurrency(
        remainingBalance
      )} remaining.`;

    budgetStatus.classList.add("success");
  } else {
    budgetStatus.textContent =
      `You have exceeded your budget by ${formatCurrency(
        Math.abs(remainingBalance)
      )}.`;

    budgetStatus.classList.add("danger");
  }
}


function formatDate(timestamp) {
  if (
    !timestamp ||
    typeof timestamp.toDate !== "function"
  ) {
    return "Recently added";
  }

  return timestamp.toDate().toLocaleDateString(
    "en-KE",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );
}


function renderExpenses() {
  if (!expensesListElement) {
    return;
  }

  expensesListElement.innerHTML = "";

  if (expenses.length === 0) {
    expensesListElement.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">＋</div>
        <h3>No expenses yet</h3>
        <p>
          Add your first expense above to start tracking
          your spending.
        </p>
      </div>
    `;

    return;
  }

  expenses.forEach((expense) => {
    const article =
      document.createElement("article");

    article.className = "expense-item";

    article.innerHTML = `
      <div class="expense-top">
        <h3 class="expense-name">
          ${escapeHTML(expense.name)}
        </h3>

        <span class="expense-icon">💳</span>
      </div>

      <p class="expense-amount">
        ${formatCurrency(expense.amount)}
      </p>

      <p class="expense-date">
        Added ${formatDate(expense.createdAt)}
        · Available for 30 days
      </p>

      <button
        class="remove-button"
        type="button"
        data-expense-id="${escapeHTML(expense.id)}"
      >
        Remove
      </button>
    `;

    expensesListElement.appendChild(article);
  });
}


function updateDashboard() {
  const totalExpenses =
    calculateTotalExpenses();

  const remainingBalance =
    monthlyIncome - totalExpenses;

  if (totalIncomeDisplay) {
    totalIncomeDisplay.textContent =
      formatCurrency(monthlyIncome);
  }

  if (totalExpensesDisplay) {
    totalExpensesDisplay.textContent =
      formatCurrency(totalExpenses);
  }

  if (remainingBalanceDisplay) {
    remainingBalanceDisplay.textContent =
      formatCurrency(remainingBalance);
  }

  if (expenseCount) {
    expenseCount.textContent =
      `${expenses.length} ${
        expenses.length === 1
          ? "record"
          : "records"
      }`;
  }

  updateBudgetStatus(remainingBalance);
  renderExpenses();
}


async function loadUserSettings() {
  const incomeDocument =
    await getDoc(getIncomeDocument());

  if (incomeDocument.exists()) {
    const incomeData =
      incomeDocument.data();

    monthlyIncome =
      Number(incomeData.monthlyIncome || 0);
  } else {
    monthlyIncome = 0;
  }

  updateDashboard();
  drawSpendingChart();
}


function applySavedTheme() {
  const savedTheme =
    localStorage.getItem("spendwise-theme") ||
    "light";

  if (themeSelect) {
    themeSelect.value = savedTheme;
  }

  document.documentElement.setAttribute(
    "data-theme",
    savedTheme
  );
}


if (copyrightYear) {
  copyrightYear.textContent =
    new Date().getFullYear();
}


if (incomeForm) {
  incomeForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      try {
        await saveIncome();
      } catch (error) {
        console.error(
          "Income could not be saved:",
          error
        );

        alert(
          "Income could not be saved. Check Firebase."
        );
      }
    }
  );
}


if (expenseForm) {
  expenseForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      try {
        await addExpense();
      } catch (error) {
        console.error(
          "Expense could not be saved:",
          error
        );

        alert(
          "Expense could not be saved. Check Firebase."
        );
      }
    }
  );
}


if (expensesListElement) {
  expensesListElement.addEventListener(
    "click",
    async (event) => {
      const removeButton =
        event.target.closest(".remove-button");

      if (!removeButton) {
        return;
      }

      try {
        await removeExpense(
          removeButton.dataset.expenseId
        );
      } catch (error) {
        console.error(
          "Expense could not be deleted:",
          error
        );

        alert("Expense could not be deleted.");
      }
    }
  );
}


if (googleLoginButton) {
  googleLoginButton.addEventListener(
    "click",
    loginWithGoogle
  );
}


if (logoutButton) {
  logoutButton.addEventListener(
    "click",
    logout
  );
}


if (sendCodeButton) {
  sendCodeButton.addEventListener(
    "click",
    sendPhoneCode
  );
}


if (verifyCodeButton) {
  verifyCodeButton.addEventListener(
    "click",
    verifyPhoneCode
  );
}


if (settingsButton) {
  settingsButton.addEventListener(
    "click",
    () => {
      const settingsSection =
        document.getElementById("settings");

      if (settingsSection) {
        settingsSection.scrollIntoView({
          behavior: "smooth"
        });
      }
    }
  );
}


if (themeSelect) {
  themeSelect.addEventListener(
    "change",
    () => {
      const selectedTheme =
        themeSelect.value;

      document.documentElement.setAttribute(
        "data-theme",
        selectedTheme
      );

      localStorage.setItem(
        "spendwise-theme",
        selectedTheme
      );
    }
  );
}


if (emailReminderButton) {
  emailReminderButton.addEventListener(
    "click",
    () => {
      if (!currentUser || !currentUser.email) {
        alert("Please sign in first.");
        return;
      }

      const subject =
        encodeURIComponent(
          "SpendWise expense reminder"
        );

      const body =
        encodeURIComponent(
          "Hello,\n\nThis is a reminder to review my SpendWise expenses before they expire after 30 days.\n\nRegards"
        );

      window.location.href =
        `mailto:${currentUser.email}?subject=${subject}&body=${body}`;
    }
  );
}


onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    if (unsubscribeExpenses) {
      unsubscribeExpenses();
      unsubscribeExpenses = null;
    }

    monthlyIncome = 0;
    expenses = [];

    showLoginScreen();
    return;
  }

  if (userName) {
    userName.textContent =
      user.displayName || "SpendWise user";
  }

  if (userEmail) {
    userEmail.textContent =
      user.email || user.phoneNumber || "";
  }

  if (userPhoto) {
    userPhoto.src =
      user.photoURL ||
      "https://ui-avatars.com/api/?name=User&background=2563eb&color=fff";

    userPhoto.alt =
      `${user.displayName || "User"} profile photo`;
  }

  showApp();
  applySavedTheme();

  try {
    await loadUserSettings();
    subscribeToExpenses();
  } catch (error) {
    console.error(
      "Could not load user data:",
      error
    );

    alert(
      "Could not load your data. Check Firebase."
    );
  }
});
let spendingChart;

function drawSpendingChart() {
  const canvas = document.getElementById("spending-chart");

  if (!canvas || !window.Chart) {
    return;
  }

  const total = expenses.reduce((sum, expense) => {
    return sum + Number(expense.amount || 0);
  }, 0);

  if (spendingChart) {
    spendingChart.destroy();
  }

  spendingChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Your current spending"],
      datasets: [
        {
          label: "KES",
          data: [total],
          backgroundColor: "#2563eb"
        }
      ]
    }
  });
}
