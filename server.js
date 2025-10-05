const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { connectDB } = require('./db');
const { authenticateToken, generateToken, optionalAuth } = require('./middleware/auth');
const User = require('./models/User');
const BookingProfile = require('./models/BookingProfile');
const BookingHistory = require('./models/BookingHistory');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS middleware for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Store active automation processes
const activeAutomations = new Map();

// Serve the mobile interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== AUTHENTICATION ENDPOINTS ====================

// User registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Username must be at least 3 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Create new user
    const user = new User({
      username,
      password,
      fullName: username // Use username as display name
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email || '',
        fullName: user.fullName
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed: ' + error.message
    });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Find user by username
    const user = await User.findOne({ username });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Get current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        fullName: req.user.fullName,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// ==================== BOOKING PROFILE ENDPOINTS ====================

// Test endpoint to check password field
app.get('/api/test-profile/:id', authenticateToken, async (req, res) => {
  try {
    const profile = await BookingProfile.findById(req.params.id).select('+password');
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    
    res.json({
      success: true,
      profile: {
        id: profile._id,
        profileName: profile.profileName,
        username: profile.username,
        password: profile.password,
        hasPassword: !!profile.password
      }
    });
  } catch (error) {
    console.error('Test profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to get test profile' });
  }
});

// Get all booking profiles for a user
app.get('/api/profiles', authenticateToken, async (req, res) => {
  try {
    const profiles = await BookingProfile.find({ userId: req.user._id })
      .select('+password') // Explicitly include password field
      .sort({ lastUsed: -1, createdAt: -1 });

    // Debug logging to see what we're getting from the database
    console.log('Raw profiles from database:', profiles.map(p => ({
      id: p._id,
      profileName: p.profileName,
      username: p.username,
      password: p.password ? '[PROVIDED]' : '[MISSING]',
      date: p.date
    })));

    const mappedProfiles = profiles.map(profile => ({
      id: profile._id,
      profileName: profile.profileName,
      username: profile.username,
      password: profile.password, // Include password for profile loading
      date: profile.date,
      courtNumber: profile.courtNumber,
      timeSlot: profile.timeSlot,
      timeSlotDisplay: profile.timeSlotDisplay,
      courtDisplay: profile.courtDisplay,
      useChromeProfile: profile.useChromeProfile,
      isDefault: profile.isDefault,
      lastUsed: profile.lastUsed,
      createdAt: profile.createdAt
    }));

    // Debug logging to see what we're sending
    console.log('Mapped profiles being sent:', mappedProfiles.map(p => ({
      id: p.id,
      profileName: p.profileName,
      username: p.username,
      password: p.password ? '[PROVIDED]' : '[MISSING]',
      date: p.date
    })));

    res.json({
      success: true,
      profiles: mappedProfiles
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profiles'
    });
  }
});

// Create a new booking profile
app.post('/api/profiles', authenticateToken, async (req, res) => {
  try {
    const { profileName, username, password, date, courtNumber, timeSlot, useChromeProfile } = req.body;

    // Debug logging
    console.log('Profile creation request:', {
      profileName,
      username,
      password: password ? '[PROVIDED]' : '[MISSING]',
      date,
      courtNumber,
      timeSlot,
      useChromeProfile
    });

    // Validation with detailed error messages
    const missingFields = [];
    if (!profileName) missingFields.push('profileName');
    if (!username) missingFields.push('username');
    if (!password) missingFields.push('password');
    if (!date) missingFields.push('date');
    if (!courtNumber) missingFields.push('courtNumber');
    if (!timeSlot) missingFields.push('timeSlot');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Check if profile name already exists for this user
    const existingProfile = await BookingProfile.findOne({
      userId: req.user._id,
      profileName
    });

    if (existingProfile) {
      return res.status(400).json({
        success: false,
        error: 'Profile name already exists'
      });
    }

    // Create new profile
    const profile = new BookingProfile({
      userId: req.user._id,
      profileName,
      username,
      password,
      date,
      courtNumber,
      timeSlot,
      useChromeProfile: useChromeProfile !== false
    });

    await profile.save();

    // Debug: Check if password was saved
    console.log('Profile saved with password:', profile.password ? '[PROVIDED]' : '[MISSING]');

    res.status(201).json({
      success: true,
      message: 'Profile created successfully',
      profile: {
        id: profile._id,
        profileName: profile.profileName,
        username: profile.username,
        date: profile.date,
        courtNumber: profile.courtNumber,
        timeSlot: profile.timeSlot,
        timeSlotDisplay: profile.timeSlotDisplay,
        courtDisplay: profile.courtDisplay,
        useChromeProfile: profile.useChromeProfile,
        isDefault: profile.isDefault,
        lastUsed: profile.lastUsed,
        createdAt: profile.createdAt
      }
    });

  } catch (error) {
    console.error('Create profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create profile'
    });
  }
});

// Update a booking profile
app.put('/api/profiles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.userId;
    delete updateData._id;
    delete updateData.createdAt;

    const profile = await BookingProfile.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id: profile._id,
        profileName: profile.profileName,
        username: profile.username,
        date: profile.date,
        courtNumber: profile.courtNumber,
        timeSlot: profile.timeSlot,
        timeSlotDisplay: profile.timeSlotDisplay,
        courtDisplay: profile.courtDisplay,
        useChromeProfile: profile.useChromeProfile,
        isDefault: profile.isDefault,
        lastUsed: profile.lastUsed,
        createdAt: profile.createdAt
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// Delete a booking profile
app.delete('/api/profiles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BookingProfile.findOneAndDelete({
      _id: id,
      userId: req.user._id
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });

  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete profile'
    });
  }
});

// Set default profile
app.patch('/api/profiles/:id/default', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // First, unset all other default profiles for this user
    await BookingProfile.updateMany(
      { userId: req.user._id },
      { isDefault: false }
    );

    // Set the selected profile as default
    const profile = await BookingProfile.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { isDefault: true },
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Default profile updated successfully'
    });

  } catch (error) {
    console.error('Set default profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set default profile'
    });
  }
});

// API endpoint to start automation
app.post('/api/start-booking', optionalAuth, async (req, res) => {
  try {
    const { username, password, date, courtNumber, timeSlot, useChromeProfile, profileId } = req.body;
    
    // Validate required fields
    if (!username || !password || !date || !courtNumber || !timeSlot) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['username', 'password', 'date', 'courtNumber', 'timeSlot']
      });
    }

    // Generate unique automation ID
    const automationId = `mobile-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    console.log(`[${automationId}] Starting automation from mobile request`);
    console.log(`[${automationId}] Details:`, { username, date, courtNumber, timeSlot });

    // Create booking history record if user is authenticated
    let bookingHistory = null;
    if (req.user && profileId) {
      try {
        bookingHistory = new BookingHistory({
          userId: req.user._id,
          profileId: profileId,
          automationId: automationId,
          status: 'running',
          bookingDetails: {
            username,
            date,
            courtNumber,
            timeSlot,
            useChromeProfile: useChromeProfile !== false
          }
        });
        await bookingHistory.save();

        // Update profile last used
        await BookingProfile.findByIdAndUpdate(profileId, { lastUsed: new Date() });
      } catch (error) {
        console.error('Error creating booking history:', error);
      }
    }

    // Start automation process
    const automationProcess = spawn('node', ['automation.js'], {
      env: {
        ...process.env,
        USERNAME: username,
        PASSWORD: password,
        BOOKING_DATE: date,
        COURT_NUMBER: courtNumber,
        TIME_SLOT: timeSlot,
        USE_CHROME_PROFILE: useChromeProfile ? "1" : "0",
        AUTOMATION_ID: automationId,
        // Pass the device token from the main process
        DEVICE_TOKEN: process.env.DEVICE_TOKEN || '',
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Store the process
    activeAutomations.set(automationId, {
      process: automationProcess,
      startTime: new Date(),
      status: 'running',
      result: null
    });

    // Handle process output
    let output = '';
    let errorOutput = '';

    automationProcess.stdout.on('data', async (data) => {
      const message = data.toString();
      output += message;
      console.log(`[${automationId}] ${message}`);
      
      // Check for completion signals
      if (message.includes('Payment URL:')) {
        const urlMatch = message.match(/Payment URL: (https?:\/\/[^\s]+)/);
        if (urlMatch) {
          const paymentUrl = urlMatch[1];
          const result = { paymentUrl, success: true };
          activeAutomations.get(automationId).result = result;
          activeAutomations.get(automationId).status = 'completed';
          
          // Update booking history if exists
          if (bookingHistory) {
            await bookingHistory.markCompleted(result);
          }
        }
      }
      
      // Check for server-specific payment URL output
      if (message.includes('PAYMENT_URL_OUTPUT:')) {
        const paymentUrl = message.replace('PAYMENT_URL_OUTPUT:', '').trim();
        const result = { paymentUrl, success: true };
        activeAutomations.get(automationId).result = result;
        activeAutomations.get(automationId).status = 'completed';
        
        // Update booking history if exists
        if (bookingHistory) {
          await bookingHistory.markCompleted(result);
        }
      }
      
      if (message.includes('Booking process completed!')) {
        activeAutomations.get(automationId).status = 'completed';
        
        // Update booking history if exists
        if (bookingHistory) {
          await bookingHistory.markCompleted({ success: true });
        }
      }
    });

    automationProcess.stderr.on('data', (data) => {
      const error = data.toString();
      errorOutput += error;
      console.error(`[${automationId}] ERROR: ${error}`);
    });

    automationProcess.on('close', async (code) => {
      console.log(`[${automationId}] Process exited with code ${code}`);
      
      const automation = activeAutomations.get(automationId);
      if (automation) {
        automation.status = code === 0 ? 'completed' : 'failed';
        if (code !== 0) {
          const result = { error: `Process failed with code ${code}`, success: false };
          automation.result = result;
          
          // Update booking history if exists
          if (bookingHistory) {
            await bookingHistory.markFailed(result.error);
          }
        }
      }
    });

    // Return automation ID immediately
    res.json({
      success: true,
      automationId,
      message: 'Automation started successfully',
      status: 'running'
    });

  } catch (error) {
    console.error('Error starting automation:', error);
    res.status(500).json({
      error: 'Failed to start automation',
      message: error.message
    });
  }
});

// ==================== BOOKING HISTORY ENDPOINTS ====================

// Get booking history for a user
app.get('/api/booking-history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const history = await BookingHistory.find({ userId: req.user._id })
      .populate('profileId', 'profileName')
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BookingHistory.countDocuments({ userId: req.user._id });

    res.json({
      success: true,
      history: history.map(record => ({
        id: record._id,
        automationId: record.automationId,
        profileName: record.profileId?.profileName || 'Unknown Profile',
        status: record.status,
        bookingDetails: record.bookingDetails,
        result: record.result,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        duration: record.duration
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get booking history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get booking history'
    });
  }
});

// Get booking history for a specific automation
app.get('/api/booking-history/:automationId', authenticateToken, async (req, res) => {
  try {
    const { automationId } = req.params;

    const record = await BookingHistory.findOne({
      automationId,
      userId: req.user._id
    }).populate('profileId', 'profileName');

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Booking record not found'
      });
    }

    res.json({
      success: true,
      record: {
        id: record._id,
        automationId: record.automationId,
        profileName: record.profileId?.profileName || 'Unknown Profile',
        status: record.status,
        bookingDetails: record.bookingDetails,
        result: record.result,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        duration: record.duration
      }
    });
  } catch (error) {
    console.error('Get booking record error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get booking record'
    });
  }
});

// API endpoint to check automation status
app.get('/api/status/:automationId', (req, res) => {
  const { automationId } = req.params;
  const automation = activeAutomations.get(automationId);
  
  if (!automation) {
    return res.status(404).json({
      error: 'Automation not found',
      automationId
    });
  }

  res.json({
    automationId,
    status: automation.status,
    startTime: automation.startTime,
    result: automation.result,
    duration: new Date() - automation.startTime
  });
});

// API endpoint to get all active automations
app.get('/api/automations', (req, res) => {
  const automations = Array.from(activeAutomations.entries()).map(([id, data]) => ({
    automationId: id,
    status: data.status,
    startTime: data.startTime,
    result: data.result,
    duration: new Date() - data.startTime
  }));

  res.json({ automations });
});

// Cleanup completed automations (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date() - (60 * 60 * 1000);
  
  for (const [id, automation] of activeAutomations.entries()) {
    if (automation.startTime < oneHourAgo && automation.status !== 'running') {
      activeAutomations.delete(id);
      console.log(`Cleaned up old automation: ${id}`);
    }
  }
}, 30 * 60 * 1000); // Run every 30 minutes

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Mobile interface: http://0.0.0.0:${PORT}`);
  console.log(`🔗 API endpoints:`);
  console.log(`   POST /api/start-booking - Start automation`);
  console.log(`   GET  /api/status/:id - Check status`);
  console.log(`   GET  /api/automations - List all automations`);
});

module.exports = app;
