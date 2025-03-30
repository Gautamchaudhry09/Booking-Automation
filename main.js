const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let automationWindow;

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

app.whenReady().then(createWindow);

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

// Handle the booking request
ipcMain.on("start-booking", async (event, formData) => {
  try {
    // Create a new window for automation
    createAutomationWindow();

    // Get the correct path for the automation script
    const automationScriptPath = app.isPackaged
      ? path.join(process.resourcesPath, "automation.js")
      : path.join(__dirname, "automation.js");

    // Start the automation script
    const automationScript = spawn("node", [automationScriptPath], {
      stdio: "inherit",
      env: {
        ...process.env,
        USERNAME: formData.username,
        PASSWORD: formData.password,
        BOOKING_DATE: formData.date,
        COURT_NUMBER: formData.courtNumber,
        TIME_SLOT: formData.timeSlot,
      },
    });

    automationScript.on("error", (error) => {
      console.error("Failed to start automation script:", error);
      event.reply("booking-error", "Failed to start automation script");
    });

    automationScript.on("close", (code) => {
      console.log(`Automation script exited with code ${code}`);
      if (code !== 0) {
        event.reply("booking-error", "Automation script failed");
      }
    });
  } catch (error) {
    console.error("Error in start-booking:", error);
    event.reply("booking-error", error.message);
  }
});
