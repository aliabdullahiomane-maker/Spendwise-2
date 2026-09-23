const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.");
}

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON
);

serviceAccount.private_key =
  serviceAccount.private_key.replace(/\\n/g, "\n");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPreviousMonthRange() {
  const now = new Date();

  const startOfCurrentMonth = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1,
      0,
      0,
      0,
      0
    )
  );

  const startOfPreviousMonth = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - 1,
      1,
      0,
      0,
      0,
      0
    )
  );

  const endOfPreviousMonth = new Date(
    startOfCurrentMonth.getTime() - 1
  );

  return {
    startOfPreviousMonth,
    endOfPreviousMonth
  };
}

function getMonthLabel(date) {
  return date.toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Nairobi"
  });
}

function getTimestampDate(timestamp) {
  if (!timestamp) {
    return null;
  }

  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  return null;
}

function isDateInRange(timestamp, startDate, endDate) {
  const date = getTimestampDate(timestamp);

  if (!date) {
    return false;
  }

  return date >= startDate && date <= endDate;
}

function createTransporter() {
  const port = Number(process.env.SMTP_PORT || 587);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

function createExpenseRows(expenses) {
  return expenses
    .map((expense) => {
      const name = escapeHTML(expense.name || "Expense");
      const amount = formatCurrency(expense.amount);

      return `
        <tr>
          <td style="
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
          ">
            ${name}
          </td>

          <td style="
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            text-align: right;
          ">
            ${amount}
          </td>
        </tr>
      `;
    })
    .join("");
}

async function sendEmail({
  email,
  displayName,
  monthLabel,
  income,
  totalExpenses,
  balance,
  expenses
}) {
  const transporter = createTransporter();

  const expenseRows = createExpenseRows(expenses);

  const expenseTable =
    expenseRows ||
    `
      <tr>
        <td colspan="2" style="padding: 10px;">
          No expenses recorded
        </td>
      </tr>
    `;

  const balanceColor =
    balance >= 0 ? "#15803d" : "#b91c1c";

  const safeName = escapeHTML(displayName || "there");
  const safeMonth = escapeHTML(monthLabel);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>SpendWise monthly summary</title>
      </head>

      <body style="
        margin: 0;
        padding: 20px;
        background: #f1f5f9;
        color: #0f172a;
        font-family: Arial, sans-serif;
      ">
        <div style="
          max-width: 620px;
          margin: 0 auto;
          padding: 28px;
          background: #ffffff;
          border-radius: 16px;
        ">
          <h1 style="color: #2563eb;">
            SpendWise
          </h1>

          <p>
            Hello ${safeName},
          </p>

          <p>
            Here is your financial summary for
            <strong>${safeMonth}</strong>.
          </p>

          <table style="
            width: 100%;
            border-collapse: collapse;
            margin: 24px 0;
          ">
            <tr>
              <td style="padding: 12px;">
                Monthly income
              </td>

              <td style="
                padding: 12px;
                text-align: right;
              ">
                ${formatCurrency(income)}
              </td>
            </tr>

            <tr>
              <td style="padding: 12px;">
                Total expenses
              </td>

              <td style="
                padding: 12px;
                text-align: right;
              ">
                ${formatCurrency(totalExpenses)}
              </td>
            </tr>

            <tr>
              <td style="
                padding: 12px;
                font-weight: bold;
              ">
                Remaining balance
              </td>

              <td style="
                padding: 12px;
                color: ${balanceColor};
                text-align: right;
                font-weight: bold;
              ">
                ${formatCurrency(balance)}
              </td>
            </tr>
          </table>

          <h2>Expenses</h2>

          <table style="
            width: 100%;
            border-collapse: collapse;
          ">
            <thead>
              <tr>
                <th style="
                  padding: 10px;
                  background: #f8fafc;
                  text-align: left;
                ">
                  Expense
                </th>

                <th style="
                  padding: 10px;
                  background: #f8fafc;
                  text-align: right;
                ">
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              ${expenseTable}
            </tbody>
          </table>

          <p style="
            margin-top: 28px;
            color: #64748b;
            font-size: 13px;
          ">
            This is an automatic monthly reminder from SpendWise.
          </p>
        </div>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `SpendWise summary for ${monthLabel}`,
    html
  });
}

async function getEmailForUser(userDocument) {
  const userData = userDocument.data();

  if (userData.email) {
    return {
      email: userData.email,
      displayName:
        userData.displayName || "SpendWise user"
    };
  }

  try {
    const authUser = await auth.getUser(userDocument.id);

    return {
      email: authUser.email || null,
      displayName:
        authUser.displayName || "SpendWise user"
    };
  } catch (error) {
    console.error(
      `Could not load Auth user ${userDocument.id}:`,
      error
    );

    return {
      email: null,
      displayName: "SpendWise user"
    };
  }
}

async function sendMonthlyReminders() {
  const {
    startOfPreviousMonth,
    endOfPreviousMonth
  } = getPreviousMonthRange();

  const monthLabel =
    getMonthLabel(startOfPreviousMonth);

  const usersSnapshot =
    await db.collection("users").get();

  let sentCount = 0;
  let skippedCount = 0;

  for (const userDocument of usersSnapshot.docs) {
    const userInfo =
      await getEmailForUser(userDocument);

    if (!userInfo.email) {
      skippedCount++;
      continue;
    }

    const uid = userDocument.id;

    const settingsDocument =
      await db
        .collection("users")
        .doc(uid)
        .collection("settings")
        .doc("finance")
        .get();

    const settingsData =
      settingsDocument.exists
        ? settingsDocument.data()
        : {};

    const income =
      Number(settingsData.monthlyIncome || 0);

    const expensesSnapshot =
      await db
        .collection("users")
        .doc(uid)
        .collection("expenses")
        .get();

    const expenses = [];

    for (const expenseDocument of expensesSnapshot.docs) {
      const expense = expenseDocument.data();

      const inPreviousMonth =
        isDateInRange(
          expense.createdAt,
          startOfPreviousMonth,
          endOfPreviousMonth
        );

      if (inPreviousMonth) {
        expenses.push(expense);
      }
    }

    const totalExpenses =
      expenses.reduce((total, expense) => {
        return total + Number(expense.amount || 0);
      }, 0);

    const balance = income - totalExpenses;

    const monthKey =
      startOfPreviousMonth
        .toISOString()
        .slice(0, 7);

    const reminderId = `${uid}_${monthKey}`;

    const reminderDocument =
      db
        .collection("monthlyReminders")
        .doc(reminderId);

    const existingReminder =
      await reminderDocument.get();

    if (existingReminder.exists) {
      skippedCount++;
      continue;
    }

    await sendEmail({
      email: userInfo.email,
      displayName: userInfo.displayName,
      monthLabel,
      income,
      totalExpenses,
      balance,
      expenses
    });

    await reminderDocument.set({
      uid,
      email: userInfo.email,
      month: monthKey,
      sentAt:
        admin.firestore.FieldValue.serverTimestamp()
    });

    sentCount++;
  }

  console.log(
    `Monthly reminders sent: ${sentCount}`
  );

  console.log(
    `Monthly reminders skipped: ${skippedCount}`
  );
}

sendMonthlyReminders()
  .then(() => {
    console.log(
      "Monthly reminder job completed."
    );

    process.exit(0);
  })
  .catch((error) => {
    console.error(
      "Monthly reminder job failed:",
      error
    );

    process.exit(1);
  });