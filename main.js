const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const {
  connectDB,
  registerSystem,
  verifySystemAuth,
  generateDeviceToken,
} = require("./db");

// Declare store at global scope
let mainWindow;
let automationWindow;
let deviceToken = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940, // Minimum width to ensure the split layout looks good
    minHeight: 600, // Minimum height for proper content display
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    center: true, // Center the window on the screen
    show: false, // Don't show until ready
  });

  mainWindow.loadFile("index.html");

  // Show window when ready to prevent flickering
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
    // Send stored profiles to the renderer process when the window is ready
    mainWindow.webContents.send(
      "load-profiles",
      global.store ? global.store.get("profiles", []) : []
    );
  });
}

function createAutomationWindow() {
  automationWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    center: true,
    show: false,
  });

  automationWindow.loadFile("index.html");

  automationWindow.once("ready-to-show", () => {
    automationWindow.show();
    automationWindow.focus();
  });
}

// Initialize the application
app.whenReady().then(async () => {
  let store;
  try {
    const Store = (await import("electron-store")).default;
    // Initialize the global store variable
    store = new Store();
    console.log("Store initialized successfully");
  } catch (error) {
    console.error("Error initializing store:", error.message);

    // If there's a JSON parse error, the store file is likely corrupted
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
      console.log("Attempting to reset corrupted store file...");

      const fs = require("fs");
      const path = require("path");

      try {
        // Get the user data directory
        const userDataPath = app.getPath("userData");
        const storeFilePath = path.join(userDataPath, "config.json");

        // Check if file exists before trying to delete
        if (fs.existsSync(storeFilePath)) {
          fs.unlinkSync(storeFilePath);
          console.log("Deleted corrupted store file:", storeFilePath);
        }

        // Reinitialize store
        const Store = (await import("electron-store")).default;
        store = new Store();
        console.log("Store reinitialized successfully after reset");
      } catch (resetError) {
        console.error("Failed to reset store:", resetError);
      }
    }
  }

  // Initialize global store
  global.store = store;

  // Connect to MongoDB and register/verify device
  try {
    const dbConnected = await connectDB();
    if (dbConnected) {
      // Register system and get device token
      deviceToken = await registerSystem();
      // Store device token locally
      if (deviceToken && store) {
        store.set("deviceToken", deviceToken);
        console.log("Device registered with token:", deviceToken);
      } else {
        console.error("Failed to register device");
      }
    } else {
      console.error("Failed to connect to database");
    }
  } catch (error) {
    console.error("Error during initialization:", error);
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle saving a profile
ipcMain.on("save-profile", (event, profileData) => {
  if (!global.store) {
    console.error("Store not available");
    event.sender.send("load-profiles", []);
    return;
  }

  const profiles = global.store.get("profiles", []);
  // Check if profile with the same name exists, update if yes, else add new
  const existingIndex = profiles.findIndex(
    (p) => p.profileName === profileData.profileName
  );
  if (existingIndex > -1) {
    profiles[existingIndex] = profileData; // Update existing profile
  } else {
    profiles.push(profileData);
  }
  global.store.set("profiles", profiles);
  // Send updated profiles back to renderer
  event.sender.send("load-profiles", profiles);
});

// Handle deleting a profile
ipcMain.on("delete-profile", (event, profileName) => {
  if (!global.store) {
    console.error("Store not available");
    event.sender.send("load-profiles", []);
    return;
  }

  let profiles = global.store.get("profiles", []);
  profiles = profiles.filter((p) => p.profileName !== profileName);
  global.store.set("profiles", profiles);
  // Send updated profiles back to renderer
  event.sender.send("load-profiles", profiles);
});

// Handle the booking request from a saved profile or the form
ipcMain.on("start-booking", async (event, formData) => {
  try {
    // Log that booking is starting
    console.log("Received start-booking request with data:", formData);

    // Get stored device token or generate if not available
    const storedToken = global.store ? global.store.get("deviceToken") : null;
    const tokenToUse = storedToken || generateDeviceToken();

    // Verify the device is authenticated and has access
    const isAuthenticated = await verifySystemAuth(tokenToUse);

    if (!isAuthenticated) {
      console.error("Device authentication failed or access revoked");
      event.reply(
        "booking-error",
        "This device is not authorized to run the automation. Access may have been revoked by the administrator."
      );
      return;
    }

    console.log("Device authenticated successfully with active access");

    const automationScriptPath = app.isPackaged
      ? path.join(process.resourcesPath, "automation.js")
      : path.join(__dirname, "automation.js");

    console.log("Spawning automation script at:", automationScriptPath);

    // Generate a unique ID for this automation run
    const automationId = `automation-${Date.now()}-${Math.floor(
      Math.random() * 10000
    )}`;

    // Define Chrome user data directory - use a unique directory for each run
    const userDataDir = formData.useChromePRofile
      ? path.join(app.getPath("userData"), "ChromeProfiles", automationId)
      : "";

    // If using Chrome profile and a profile directory exists, copy the base profile
    if (formData.useChromePRofile) {
      const fs = require("fs-extra");
      const baseProfileDir = path.join(
        app.getPath("userData"),
        "ChromeProfile"
      );

      // Create the profiles directory if it doesn't exist
      if (
        !fs.existsSync(path.join(app.getPath("userData"), "ChromeProfiles"))
      ) {
        fs.mkdirSync(path.join(app.getPath("userData"), "ChromeProfiles"), {
          recursive: true,
        });
      }

      // If base profile exists, copy it to the new unique profile directory
      if (fs.existsSync(baseProfileDir)) {
        try {
          fs.copySync(baseProfileDir, userDataDir);
          console.log(
            `Copied base Chrome profile to unique directory: ${userDataDir}`
          );
        } catch (copyError) {
          console.error(`Failed to copy Chrome profile: ${copyError.message}`);
          // Continue without profile if copy fails
        }
      } else {
        console.log(
          `No base Chrome profile found at ${baseProfileDir}, will create new profile`
        );
      }
    }

    const automationScript = spawn("node", [automationScriptPath], {
      stdio: "inherit",
      env: {
        ...process.env,
        USERNAME: formData.username,
        PASSWORD: formData.password,
        BOOKING_DATE: formData.date,
        COURT_NUMBER: formData.courtNumber,
        TIME_SLOT: formData.timeSlot,
        USE_CHROME_PROFILE: formData.useChromePRofile ? "1" : "0",
        CHROME_USER_DATA_DIR: userDataDir,
        DEVICE_TOKEN: tokenToUse, // Pass token to automation script
        AUTOMATION_ID: automationId, // Pass unique ID to automation script
      },
    });

    automationScript.on("error", (error) => {
      console.error("Failed to start automation script:", error);
      event.reply(
        "booking-error",
        `Failed to start automation: ${error.message}`
      );
    });

    automationScript.on("close", (code) => {
      console.log(`Automation script exited with code ${code}`);

      // Clean up the temporary profile directory if it was created
      if (formData.useChromePRofile && userDataDir) {
        try {
          const fs = require("fs-extra");
          // Only remove if it's in the ChromeProfiles directory (safety check)
          if (userDataDir.includes("ChromeProfiles")) {
            fs.remove(userDataDir)
              .then(() =>
                console.log(
                  `Removed temporary Chrome profile at ${userDataDir}`
                )
              )
              .catch((err) =>
                console.error(`Failed to remove Chrome profile: ${err.message}`)
              );
          }
        } catch (error) {
          console.error(
            `Error cleaning up profile directory: ${error.message}`
          );
        }
      }

      if (code !== 0) {
        event.reply("booking-error", `Automation failed with code ${code}`);
      }
    });
  } catch (error) {
    console.error("Error in start-booking IPC handler:", error);
    event.reply(
      "booking-error",
      `Error processing booking request: ${error.message}`
    );
  }
});

// Handle request for initial profiles
ipcMain.on("request-initial-profiles", (event) => {
  if (global.store) {
    event.sender.send("load-profiles", global.store.get("profiles", []));
  } else {
    // If store is not yet initialized, send empty array
    event.sender.send("load-profiles", []);
  }
});

// Synchronous handler to get profiles
ipcMain.handle("get-profiles", (event) => {
  return global.store ? global.store.get("profiles", []) : [];
});

// Alternate sync method that doesn't require a Promise (for simpler usage)
ipcMain.on("get-profiles", (event) => {
  event.returnValue = global.store ? global.store.get("profiles", []) : [];
});
