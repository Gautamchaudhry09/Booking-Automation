const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");
const path = require("path");

(async () => {
  try {
    const users = [
      {
        name: "S2065",
        password: "cockroach",
      },
      {
        name: "G0583",
        password: "Junnu958i@09",
      },
    ];
    const user = users[1];
    const targetDate = "01/04/2025"; // Given date in DD/MM/YYYY format
    const courtNumber = "13";

    console.log("Launching browser...");
    const browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    console.log("Creating new page...");
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

    // Capture CAPTCHA Text
    async function retryAction(action, maxAttempts = 5, delayMs = 1000) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await action(); // Try executing the action
        } catch (error) {
          console.log(`Attempt ${attempt} failed: ${error.message}`);
          if (attempt === maxAttempts) throw error; // Fail after max attempts
          console.log("retrying action", action);
          await new Promise((resolve) => setTimeout(resolve, delayMs)); // Wait before retrying
        }
      }
    }

    const MAX_RETRIES = 3; // Maximum retry attempts

    async function getCaptchaText(queryString) {
      console.log("Getting CAPTCHA...");
      const captchaElement = await page.$(queryString);
      if (!captchaElement) {
        throw new Error("CAPTCHA element not found");
      }
      const captchaPath = path.join(__dirname, "captcha.png");
      await captchaElement.screenshot({ path: captchaPath });

      console.log("Processing CAPTCHA with Tesseract...");
      // Use Tesseract.js to extract numbers
      const {
        data: { text },
      } = await Tesseract.recognize(captchaPath, "eng");

      console.log("Extracted CAPTCHA:", text);

      // Extract numbers and solve
      const numbers = text.match(/\d+/g);
      if (!numbers || numbers.length < 2) {
        console.error("Failed to detect numbers in CAPTCHA.");
        throw new Error("Failed to detect numbers in CAPTCHA.");
      }

      return numbers;
    }

    async function checkCaptchaError() {
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

    async function login() {
      let success = false;

      while (!success) {
        try {
          const numbers = await retryAction(async () =>
            getCaptchaText('img[src="mcapcha.aspx"]')
          );
          const sum = parseInt(numbers[0]) + parseInt(numbers[1]);
          console.log(`Solved CAPTCHA: ${numbers[0]} + ${numbers[1]} = ${sum}`);

          // Fill in login details
          await page.type("#txtUserName", user.name, { delay: 100 });
          await page.type("#txtPassword", user.password, { delay: 100 });
          await page.select("#ddlUserType", "LM");
          await page.select("#ddlCompName", "YSC");
          await page.type("#txtCapcha", sum.toString(), { delay: 100 });

          // Submit the form
          await Promise.all([
            page.click("#btnLogin"),
            page.waitForNavigation({ waitUntil: "networkidle0" }),
          ]);

          // Check if login failed due to CAPTCHA
          if (await checkCaptchaError()) {
            console.log("CAPTCHA was incorrect. Retrying...");
            continue; // Retry login process
          }

          success = true;
        } catch (error) {
          console.error("Login error:", error);
          throw error;
        }
      }

      if (!success) {
        throw new Error("Login failed after multiple attempts.");
      }

      console.log("Logged in successfully!");
    }

    // Start login process
    await login();

    console.log("Navigating to booking page...");
    //Go to booking page
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

    //Select the Date
    async function selectDay(page, targetDate) {
      console.log("Selecting date...");
      // Step 1: Click the date input field to open the date picker
      await page.click("#MainContent_txtBookingDate");

      // Step 2: Extract the target day
      const day = parseInt(targetDate.split("/")[0]); // Convert "01" to 1

      // Step 3: Click the correct day in the date picker
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

    await retryAction(async () => selectDay(page, targetDate));

    console.log("Selecting game type...");
    //Select game type - sport
    await Promise.all([
      retryAction(async () => page.select("#MainContent_ddlGames", "20")),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    //select category - indoor/outdoor
    await Promise.all([
      retryAction(async () =>
        page.select("#MainContent_ddlGameCategory", "201")
      ),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    console.log("Searching for courts...");
    // Search for courts
    await Promise.all([
      retryAction(async () => page.click("#MainContent_btnSearch")),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    console.log("Selecting court...");
    await Promise.all([
      page.select("#MainContent_grdGameSlot_ddlCourtTable_21", courtNumber),
      page.click("#MainContent_grdGameSlot_lnkEdit_21"),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    console.log("Processing final CAPTCHA...");
    //Get Captcha text from the url
    const captchaElement = await page.$("#MainContent_imgCaptchaImage");
    const captchaUrl = await captchaElement.evaluate((img) => img.src);
    const captchaText = new URL(captchaUrl).searchParams.get("txt");

    console.log("Extracted CAPTCHA:", captchaText);

    await page.type("#MainContent_txtCpCode", captchaText.trim());

    page.on("dialog", async (dialog) => {
      await dialog.accept(); // Clicks "OK"
    });

    console.log("Saving booking...");
    await Promise.all([
      page.click("#MainContent_btnSave"),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]); // Clicks "OK"

    console.log("Accepting terms and conditions...");
    await Promise.all([
      retryAction(() => page.click("#chkTermCondition")),
      retryAction(() => page.click("button.btn.btn-success")),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]); // accepts terms and conditions

    console.log(
      "Booking process completed! Window will remain open for payment."
    );
    await new Promise(() => {}); // Keep the browser window open
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
})();
