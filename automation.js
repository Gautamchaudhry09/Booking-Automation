const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");
const path = require("path");
const mongoose = require("mongoose");
const fs = require("fs");

// Device authentication verification
async function verifyDeviceAuthentication() {
  const deviceToken = process.env.DEVICE_TOKEN;

  if (!deviceToken) {
    console.error("No device token provided");
    return false;
  }

  try {
    // Connect to MongoDB
    await mongoose.connect(
      "mongodb+srv://gautam:junnu958i@cluster0.2tw5hy6.mongodb.net/Cluster0?retryWrites=true&w=majority",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );

    // Define schema for authenticated systems
    const AuthenticatedSystemSchema = new mongoose.Schema({
      deviceToken: {
        type: String,
        required: true,
        unique: true,
      },
      deviceName: {
        type: String,
        required: true,
      },
      userAccess: {
        type: Boolean,
        default: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      lastLogin: {
        type: Date,
        default: Date.now,
      },
    });

    // Create model
    const AuthenticatedSystem =
      mongoose.models.AuthenticatedSystem ||
      mongoose.model("AuthenticatedSystem", AuthenticatedSystemSchema);

    // Verify if system is authenticated and has access
    const system = await AuthenticatedSystem.findOne({ deviceToken });

    if (!system) {
      console.error("Device not found in authentication database");
      return false;
    }

    if (!system.userAccess) {
      console.error("Device access has been revoked by administrator");
      return false;
    }

    // Update last login time
    system.lastLogin = new Date();
    await system.save();

    return true;
  } catch (error) {
    console.error("Error verifying device authentication:", error.message);
    return false;
  }
}

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
  const automationId = process.env.AUTOMATION_ID || "auto-unknown";
  console.log(`[${automationId}] Getting CAPTCHA...`);

  // Create captcha folder if it doesn't exist
  const captchaDir = path.join(__dirname, "captcha");

  if (!fs.existsSync(captchaDir)) {
    fs.mkdirSync(captchaDir, { recursive: true });
    console.log(`[${automationId}] Created captcha directory at ${captchaDir}`);
  }

  const captchaElement = await page.$(queryString);
  if (!captchaElement) {
    throw new Error("CAPTCHA element not found");
  }

  const captchaPath = path.join(captchaDir, `captcha-${automationId}.png`);
  await captchaElement.screenshot({ path: captchaPath });

  console.log(`[${automationId}] Processing CAPTCHA with Tesseract...`);
  const {
    data: { text },
  } = await Tesseract.recognize(captchaPath, "eng");

  console.log(`[${automationId}] Extracted CAPTCHA:`, text);

  const numbers = text.match(/\d+/g);
  if (!numbers || numbers.length < 2) {
    console.error(`[${automationId}] Failed to detect numbers in CAPTCHA.`);
    throw new Error("Failed to detect numbers in CAPTCHA.");
  }

  return numbers;
}

async function checkCaptchaError(page) {
  const automationId = process.env.AUTOMATION_ID || "auto-unknown";
  const errorMsg = await retryAction(async () => {
    const element = await page.$("#lblMsg");
    return element ? await element.evaluate((el) => el.textContent) : null;
  });
  if (errorMsg) {
    console.log(`[${automationId}] Login Error Message:`, errorMsg);
    return true;
  }
  return false;
}

async function login(page, username, password) {
  const automationId = process.env.AUTOMATION_ID || "auto-unknown";
  let success = false;

  while (!success) {
    try {
      const numbers = await retryAction(async () =>
        getCaptchaText(page, 'img[src="mcapcha.aspx"]')
      );
      const sum = parseInt(numbers[0]) + parseInt(numbers[1]);
      console.log(
        `[${automationId}] Solved CAPTCHA: ${numbers[0]} + ${numbers[1]} = ${sum}`
      );

      // Only type credentials if they're not already filled
      const usernameField = await page.$("#txtUserName");
      const passwordField = await page.$("#txtPassword");
      const userTypeField = await page.$("#ddlUserType");
      const compNameField = await page.$("#ddlCompName");

      if (!(await usernameField.evaluate((el) => el.value))) {
        await page.type("#txtUserName", username);
      }
      if (!(await passwordField.evaluate((el) => el.value))) {
        await page.type("#txtPassword", password);
      }
      if (!(await userTypeField.evaluate((el) => el.value))) {
        await page.select("#ddlUserType", "LM");
      }
      await page.select("#ddlCompName", "YSC");

      // Clear and enter new CAPTCHA
      await page.$eval("#txtCapcha", (el) => (el.value = ""));
      await page.type("#txtCapcha", sum.toString());

      await Promise.all([page.click("#btnLogin"), page.waitForNavigation()]);

      if (await checkCaptchaError(page)) {
        console.log(
          `[${automationId}] CAPTCHA was incorrect. Retrying with new CAPTCHA...`
        );
        continue;
      }

      success = true;
    } catch (error) {
      console.error(`[${automationId}] Login error:`, error);
      throw error;
    }
  }

  console.log(`[${automationId}] Logged in successfully!`);
}

async function selectDay(page, targetDate) {
  const automationId = process.env.AUTOMATION_ID || "auto-unknown";
  console.log(`[${automationId}] Selecting date...`);
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
  const automationId = process.env.AUTOMATION_ID || "auto-unknown";
  while (true) {
    try {
      console.log(`[${automationId}] Searching for courts...`);
      await Promise.all([
        retryAction(async () => page.click("#MainContent_btnSearch")),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);

      console.log(
        `[${automationId}] Checking if court selection is available...`,
        timeSlot
      );
      // Wait for a short time to see if the element appears
      const courtSelector = await page.waitForSelector(
        `#MainContent_grdGameSlot_ddlCourtTable_${timeSlot}`,
        { timeout: 2000 } // 2s second timeout
      );

      if (courtSelector) {
        console.log(
          `[${automationId}] Court selector found, attempting to select court...`
        );
        await Promise.all([
          page.select(
            `#MainContent_grdGameSlot_ddlCourtTable_${timeSlot}`,
            courtNumber
          ),
          page.click(`#MainContent_grdGameSlot_lnkEdit_${timeSlot}`),
          page.waitForNavigation(),
        ]);
        console.log(`[${automationId}] Court selected successfully!`);
        return; // Exit the loop if successful
      }
    } catch (error) {
      console.log(
        `[${automationId}] Court selection not available yet, retrying...`,
        error.message
      );
      // Wait for 2 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue; // Continue the loop
    }
  }
}

async function main() {
  const automationId = process.env.AUTOMATION_ID || `auto-${Date.now()}`;

  try {
    // First verify device authentication
    const isAuthenticated = await verifyDeviceAuthentication();
    if (!isAuthenticated) {
      console.error(
        `[${automationId}] Device authentication failed. Not authorized to run automation.`
      );
      process.exit(1);
    }

    console.log(
      `[${automationId}] Device authentication successful. Proceeding with automation...`
    );

    const username = process.env.USERNAME;
    const password = process.env.PASSWORD;
    const targetDate = process.env.BOOKING_DATE;
    const courtNumber = process.env.COURT_NUMBER;
    const timeSlot = process.env.TIME_SLOT;
    const useProfile = process.env.USE_CHROME_PROFILE === "1";
    const userDataDir = process.env.CHROME_USER_DATA_DIR;

    if (!username || !password || !targetDate || !courtNumber || !timeSlot) {
      console.error(`[${automationId}] Missing required environment variables`);
      process.exit(1);
    }

    // Create captcha folder if it doesn't exist
    const captchaDir = path.join(__dirname, "captcha");

    if (!fs.existsSync(captchaDir)) {
      fs.mkdirSync(captchaDir, { recursive: true });
      console.log(
        `[${automationId}] Created captcha directory at ${captchaDir}`
      );
    }

    // Clean up old captcha files (older than 24 hours)
    try {
      const files = fs.readdirSync(captchaDir);
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      let cleanedCount = 0;
      for (const file of files) {
        const filePath = path.join(captchaDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > oneDayMs) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(
          `[${automationId}] Cleaned up ${cleanedCount} old captcha files`
        );
      }
    } catch (cleanupError) {
      console.error(
        `[${automationId}] Error cleaning up captcha files: ${cleanupError.message}`
      );
    }

    console.log(
      `[${automationId}] Launching browser with profile:`,
      useProfile ? userDataDir : "none"
    );

    // Browser launch options
    const launchOptions = {
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--start-maximized",
        `--user-data-dir=${userDataDir}`,
        `--window-name=DDA-Sports-Booking-${automationId}`, // Add window name for identification
        "--new-window", // Force new window
        "--disable-site-isolation-trials", // Prevent potential isolation issues
        "--disable-features=IsolateOrigins,site-per-process", // Additional isolation prevention
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ["--enable-automation"], // Hide automation flags
    };

    // Add user data dir if using profile
    if (useProfile && userDataDir) {
      console.log(
        `[${automationId}] Using Chrome profile directory:`,
        userDataDir
      );
      launchOptions.userDataDir = userDataDir;
    }

    const browser = await puppeteer.launch(launchOptions);

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

    console.log(`[${automationId}] Navigating to login page...`);
    await page.goto("https://ddasports.com/app/", {
      waitUntil: "domcontentloaded",
    });

    await login(page, username, password);

    console.log(`[${automationId}] Navigating to booking page...`);
    await Promise.all([
      retryAction(async () => {
        const links = await page.$$("ul.list-group a.list-group-item");
        if (links[5]) {
          await links[5].click();
        } else {
          throw new Error("Booking page link not found");
        }
      }),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    await retryAction(async () => selectDay(page, targetDate));

    console.log(`[${automationId}] Selecting game type...`);
    await Promise.all([
      retryAction(async () => page.select("#MainContent_ddlGames", "20")),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    await Promise.all([
      retryAction(async () =>
        page.select("#MainContent_ddlGameCategory", "201")
      ),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    await waitForAndSelectCourt(page, courtNumber, timeSlot);

    console.log(`[${automationId}] Processing final CAPTCHA...`);
    const captchaElement = await page.$("#MainContent_imgCaptchaImage");
    const captchaUrl = await captchaElement.evaluate((img) => img.src);
    const captchaText = new URL(captchaUrl).searchParams.get("txt");

    console.log(`[${automationId}] Extracted CAPTCHA:`, captchaText);
    await page.type("#MainContent_txtCpCode", captchaText.trim());

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    console.log(`[${automationId}] Saving booking...`);
    await Promise.all([
      page.click("#MainContent_btnSave"),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    console.log(`[${automationId}] Accepting terms and conditions...`);
    await Promise.all([
      retryAction(() => page.click("#chkTermCondition")),
      retryAction(() => page.click("button.btn.btn-success")),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    console.log(
      `[${automationId}] Booking process completed! Window will remain open for payment.`
    );
    await new Promise(() => {}); // Keep the window open
  } catch (error) {
    console.error(`[${automationId}] An error occurred:`, error);
    process.exit(1);
  }
}

main();
