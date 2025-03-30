const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");
const path = require("path");

async function retryAction(action, maxAttempts = 5, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxAttempts) throw error;
      console.log("retrying action", action);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function getCaptchaText(page, queryString) {
  console.log("Getting CAPTCHA...");
  const captchaElement = await page.$(queryString);
  if (!captchaElement) {
    throw new Error("CAPTCHA element not found");
  }
  const captchaPath = path.join(__dirname, "captcha.png");
  await captchaElement.screenshot({ path: captchaPath });

  console.log("Processing CAPTCHA with Tesseract...");
  const {
    data: { text },
  } = await Tesseract.recognize(captchaPath, "eng");

  console.log("Extracted CAPTCHA:", text);

  const numbers = text.match(/\d+/g);
  if (!numbers || numbers.length < 2) {
    console.error("Failed to detect numbers in CAPTCHA.");
    throw new Error("Failed to detect numbers in CAPTCHA.");
  }

  return numbers;
}

async function checkCaptchaError(page) {
  const errorMsg = await retryAction(async () => {
    const element = await page.$("#lblMsg");
    return element ? await element.evaluate((el) => el.textContent) : null;
  });
  if (errorMsg) {
    console.log("Login Error Message:", errorMsg);
    return true;
  }
  return false;
}

async function login(page, username, password) {
  let success = false;

  while (!success) {
    try {
      const numbers = await retryAction(async () =>
        getCaptchaText(page, 'img[src="mcapcha.aspx"]')
      );
      const sum = parseInt(numbers[0]) + parseInt(numbers[1]);
      console.log(`Solved CAPTCHA: ${numbers[0]} + ${numbers[1]} = ${sum}`);

      // Only type credentials if they're not already filled
      const usernameField = await page.$("#txtUserName");
      const passwordField = await page.$("#txtPassword");
      const userTypeField = await page.$("#ddlUserType");
      const compNameField = await page.$("#ddlCompName");

      if (!(await usernameField.evaluate((el) => el.value))) {
        await page.type("#txtUserName", username, { delay: 100 });
      }
      if (!(await passwordField.evaluate((el) => el.value))) {
        await page.type("#txtPassword", password, { delay: 100 });
      }
      if (!(await userTypeField.evaluate((el) => el.value))) {
        await page.select("#ddlUserType", "LM");
      }
      await page.select("#ddlCompName", "YSC");

      // Clear and enter new CAPTCHA
      await page.$eval("#txtCapcha", (el) => (el.value = ""));
      await page.type("#txtCapcha", sum.toString(), { delay: 100 });

      await Promise.all([
        page.click("#btnLogin"),
        page.waitForNavigation({ waitUntil: "networkidle0" }),
      ]);

      if (await checkCaptchaError(page)) {
        console.log("CAPTCHA was incorrect. Retrying with new CAPTCHA...");
        continue;
      }

      success = true;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }

  console.log("Logged in successfully!");
}

async function selectDay(page, targetDate) {
  console.log("Selecting date...");
  await page.click("#MainContent_txtBookingDate");
  const day = parseInt(targetDate.split("/")[0]);
  await page.evaluate((day) => {
    document
      .querySelectorAll(".datepicker-days td.day:not(.disabled)")
      .forEach((el) => {
        if (el.textContent.trim() === day.toString()) {
          el.click();
        }
      });
  }, day);
}

async function waitForAndSelectCourt(page, courtNumber, timeSlot) {
  while (true) {
    try {
      console.log("Searching for courts...");
      await Promise.all([
        retryAction(async () => page.click("#MainContent_btnSearch")),
        page.waitForNavigation({ waitUntil: "networkidle0" }),
      ]);

      console.log("Checking if court selection is available...", timeSlot);
      // Wait for a short time to see if the element appears
      const courtSelector = await page.waitForSelector(
        `#MainContent_grdGameSlot_ddlCourtTable_${timeSlot}`,
        { timeout: 2000 } // 2s second timeout
      );

      if (courtSelector) {
        console.log("Court selector found, attempting to select court...");
        await Promise.all([
          page.select(
            `#MainContent_grdGameSlot_ddlCourtTable_${timeSlot}`,
            courtNumber
          ),
          page.click(`#MainContent_grdGameSlot_lnkEdit_${timeSlot}`),
          page.waitForNavigation({ waitUntil: "networkidle0" }),
        ]);
        console.log("Court selected successfully!");
        return; // Exit the loop if successful
      }
    } catch (error) {
      console.log(
        "Court selection not available yet, retrying...",
        error.message
      );
      // Wait for 2 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue; // Continue the loop
    }
  }
}

async function main() {
  const username = process.env.USERNAME;
  const password = process.env.PASSWORD;
  const targetDate = process.env.BOOKING_DATE;
  const courtNumber = process.env.COURT_NUMBER;
  const timeSlot = process.env.TIME_SLOT;

  if (!username || !password || !targetDate || !courtNumber || !timeSlot) {
    console.error("Missing required environment variables");
    process.exit(1);
  }

  try {
    const browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
      defaultViewport: null,
    });

    const page = await browser.newPage();

    // Modify User-Agent and Headers
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Enable stealth mode
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    console.log("Navigating to login page...");
    await page.goto("https://ddasports.com/app/", {
      waitUntil: "networkidle0",
    });

    await login(page, username, password);

    console.log("Navigating to booking page...");
    await Promise.all([
      retryAction(async () => {
        const links = await page.$$("ul.list-group a.list-group-item");
        if (links[5]) {
          await links[5].click();
        } else {
          throw new Error("Booking page link not found");
        }
      }),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    await retryAction(async () => selectDay(page, targetDate));

    console.log("Selecting game type...");
    await Promise.all([
      retryAction(async () => page.select("#MainContent_ddlGames", "20")),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    await Promise.all([
      retryAction(async () =>
        page.select("#MainContent_ddlGameCategory", "201")
      ),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    await waitForAndSelectCourt(page, courtNumber, timeSlot);

    console.log("Processing final CAPTCHA...");
    const captchaElement = await page.$("#MainContent_imgCaptchaImage");
    const captchaUrl = await captchaElement.evaluate((img) => img.src);
    const captchaText = new URL(captchaUrl).searchParams.get("txt");

    console.log("Extracted CAPTCHA:", captchaText);
    await page.type("#MainContent_txtCpCode", captchaText.trim());

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    console.log("Saving booking...");
    await Promise.all([
      page.click("#MainContent_btnSave"),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    console.log("Accepting terms and conditions...");
    await Promise.all([
      retryAction(() => page.click("#chkTermCondition")),
      retryAction(() => page.click("button.btn.btn-success")),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    console.log(
      "Booking process completed! Window will remain open for payment."
    );
    await new Promise(() => {}); // Keep the window open
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

main();
