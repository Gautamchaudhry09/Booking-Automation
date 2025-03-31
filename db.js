const mongoose = require("mongoose");
const os = require("os");

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://gautam:junnu958i@cluster0.2tw5hy6.mongodb.net/Cluster0?retryWrites=true&w=majority",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log("MongoDB connected successfully");
    return true;
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    return false;
  }
};

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
    index: true,
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
const AuthenticatedSystem = mongoose.model(
  "AuthenticatedSystem",
  AuthenticatedSystemSchema
);

// Generate a unique device token based on hardware information
const generateDeviceToken = () => {
  const hostname = os.hostname();
  const platform = os.platform();
  const cpus = os.cpus()[0]?.model || "unknown";
  const totalMem = os.totalmem();

  // Create a unique string based on hardware info
  const uniqueString = `${hostname}-${platform}-${cpus}-${totalMem}`;

  // Simple hash function for the string
  let hash = 0;
  for (let i = 0; i < uniqueString.length; i++) {
    const char = uniqueString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `device-${Math.abs(hash).toString(16)}`;
};

// Get device name
const getDeviceName = () => {
  return os.hostname();
};

// Register system in database if not already registered
const registerSystem = async () => {
  try {
    const deviceName = getDeviceName();

    // First check if a device with this name already exists
    let existingDevice = await AuthenticatedSystem.findOne({ deviceName });

    if (existingDevice) {
      console.log("Device already registered with name:", deviceName);

      // Update last login time
      existingDevice.lastLogin = new Date();
      await existingDevice.save();

      return existingDevice.deviceToken;
    }

    // If no existing device, create a new one
    const deviceToken = generateDeviceToken();

    // Register new system
    const system = new AuthenticatedSystem({
      deviceToken,
      deviceName,
      userAccess: true, // Default to allowing access
    });

    await system.save();
    console.log("Device registered successfully:", deviceName);

    return deviceToken;
  } catch (error) {
    console.error("Error registering system:", error.message);
    return null;
  }
};

// Verify if system is authenticated and has access
const verifySystemAuth = async (deviceToken) => {
  try {
    const system = await AuthenticatedSystem.findOne({ deviceToken });

    // Check if system exists and has access
    if (!system) {
      console.error("Device not found in authentication database");
      return false;
    }

    if (!system.userAccess) {
      console.error("Device access has been revoked");
      return false;
    }

    // Update last login time
    system.lastLogin = new Date();
    await system.save();

    return true;
  } catch (error) {
    console.error("Error verifying system authentication:", error.message);
    return false;
  }
};

module.exports = {
  connectDB,
  registerSystem,
  verifySystemAuth,
  generateDeviceToken,
  getDeviceName,
};
