
const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");
const path = require("path");

(async () => {
  try {
    const user = {
      name: "G0583",
      password: "Junnu958i@09"
    };
    const targetDate = "01/04/2025";
    const courtNumber = "13";

    console.log("Launching browser...");
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      defaultViewport: null
    });

    // Rest of your automation script...
    // Copy the entire content of your working DDA-sportsAutomation.js here
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
    await page.goto("https://ddasports.com/app/", { waitUntil: 'networkidle0' });

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

    async function getCaptchaText(queryString) {
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

    async function checkCaptchaError() {
      const errorMsg = await retryAction(async () => {
        const element = await page.$("#lblMsg");
        return element ? await element.evaluate(el => el.textContent) : null;
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

          await page.type("#txtUserName", user.name, { delay: 100 });
          await page.type("#txtPassword", user.password, { delay: 100 });
          await page.select("#ddlUserType", "LM");
          await page.select("#ddlCompName", "YSC");
          await page.type("#txtCapcha", sum.toString(), { delay: 100 });

          await Promise.all([
            page.click("#btnLogin"),
            page.waitForNavigation({ waitUntil: 'networkidle0' })
          ]);

          if (await checkCaptchaError()) {
            console.log("CAPTCHA was incorrect. Retrying...");
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

    await login();

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
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    async function selectDay(page, targetDate) {
      console.log("Selecting date...");
      await page.click("#MainContent_txtBookingDate");
      const day = parseInt(targetDate.split("/")[0]);
      await page.evaluate((day) => {
        document.querySelectorAll(".datepicker-days td.day:not(.disabled)")
          .forEach((el) => {
            if (el.textContent.trim() === day.toString()) {
              el.click();
            }
          });
      }, day);
    }

    await retryAction(async () => selectDay(page, targetDate));

    console.log("Selecting game type...");
    await Promise.all([
      retryAction(async () => page.select("#MainContent_ddlGames", "20")),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    await Promise.all([
      retryAction(async () => page.select("#MainContent_ddlGameCategory", "201")),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    console.log("Searching for courts...");
    await Promise.all([
      retryAction(async () => page.click("#MainContent_btnSearch")),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    console.log("Selecting court...");
    await Promise.all([
      page.select("#MainContent_grdGameSlot_ddlCourtTable_21", courtNumber),
      page.click("#MainContent_grdGameSlot_lnkEdit_21"),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

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
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    console.log("Accepting terms and conditions...");
    await Promise.all([
      retryAction(() => page.click("#chkTermCondition")),
      retryAction(() => page.click("button.btn.btn-success")),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    console.log("Booking process completed! Window will remain open for payment.");
    await new Promise(() => {});
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
})();