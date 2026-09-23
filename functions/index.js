const {
  onSchedule
} = require("firebase-functions/v2/scheduler");

const {
  defineSecret
} = require("firebase-functions/params");

const {
  initializeApp
} = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue
} = require("firebase-admin/firestore");

const {
  getAuth
} = require("firebase-admin/auth");

const nodemailer =
  require("nodemailer");


initializeApp();

const db = getFirestore();
const adminAuth = getAuth();


const SMTP_HOST =
  defineSecret("SMTP_HOST");

const SMTP_PORT =
  defineSecret("SMTP_PORT");

const SMTP_USER =
  defineSecret("SMTP_USER");

const SMTP_PASSWORD =
  defineSecret("SMTP_PASSWORD");

const EMAIL_FROM =
  defineSecret("EMAIL_FROM");


function formatCurrency(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
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


function isDateInRange(
  timestamp,
  startDate,
  endDate
) {
  const date = getTimestampDate(timestamp);

  if (!date) {
    return false;
  }

  return (
    date >= startDate &&
    date <= endDate
  );
}


async function sendMonthlyReminder(
  email,
  displayName,
  monthLabel,
  income,
  totalExpenses,
  balance,
  expenseRows
) {
  const smtpPort =
    Number(SMTP_PORT.value()) || 587;

  const transporter =
    nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: SMTP_USER.value(),
        pass: SMTP_PASSWORD.value()
      }
    });

  const expenseTable =
    expenseRows.length > 0
      ? expenseRows.join("")
      : `
        <tr>
          <td colspan="2">
            No expenses recorded
          </td>
        </tr>
      `;

  const balanceColor =
    balance >= 0 ? "#15803d" : "#b91c1c";

  const html = `
    <!DOCTYPE html>
    <html>
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
            Hello ${displayName || "there"},
          </p>

          <p>
            Here is your financial summary for
            <strong>${monthLabel}</strong>.
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
                  text-align: left;
                ">
                  Expense
                </th>

                <th style="
                  padding: 10px;
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
    from: EMAIL_FROM.value(),
    to: email,
    subject: `SpendWise summary for ${monthLabel}`,
    html: html
  });
}


exports.sendMonthlyReminders = onSchedule(
  {
    schedule: "0 6 1 * *",
    timeZone: "Africa/Nairobi",
    region: "us-central1",

    secrets: [
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASSWORD,
      EMAIL_FROM
    ]
  },

  async () => {
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
      const uid = userDocument.id;
      const userData = userDocument.data();

      let email =
        userData.email || null;

      let displayName =
        userData.displayName || "SpendWise user";

      if (!email) {
        try {
          const authUser =
            await adminAuth.getUser(uid);

          email =
            authUser.email || null;

          displayName =
            authUser.displayName ||
            displayName;
        } catch (error) {
          console.error(
            `Could not get user ${uid}:`,
            error
          );

          skippedCount++;
          continue;
        }
      }

      if (!email) {
        skippedCount++;
        continue;
      }

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

      let totalExpenses = 0;
      const expenseRows = [];

      expensesSnapshot.forEach((expenseDocument) => {
        const expense =
          expenseDocument.data();

        if (
          !isDateInRange(
            expense.createdAt,
            startOfPreviousMonth,
            endOfPreviousMonth
          )
        ) {
          return;
        }

        const amount =
          Number(expense.amount || 0);

        totalExpenses += amount;

        expenseRows.push(`
          <tr>
            <td style="padding: 10px;">
              ${String(expense.name || "Expense")}
            </td>

            <td style="
              padding: 10px;
              text-align: right;
            ">
              ${formatCurrency(amount)}
            </td>
          </tr>
        `);
      });

      const balance =
        income - totalExpenses;

      const reminderId =
        `${uid}_${startOfPreviousMonth
          .toISOString()
          .slice(0, 7)}`;

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

      await sendMonthlyReminder(
        email,
        displayName,
        monthLabel,
        income,
        totalExpenses,
        balance,
        expenseRows
      );

      await reminderDocument.set({
        uid: uid,
        email: email,
        month: startOfPreviousMonth
          .toISOString()
          .slice(0, 7),
        sentAt: FieldValue.serverTimestamp()
      });

      sentCount++;
    }

    console.log(
      `Monthly reminders sent: ${sentCount}`
    );

    console.log(
      `Monthly reminders skipped: ${skippedCount}`
    );

    return null;
  }
);