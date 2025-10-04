const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store active automation processes
const activeAutomations = new Map();

// Serve the mobile interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to start automation
app.post('/api/start-booking', async (req, res) => {
  try {
    const { username, password, date, courtNumber, timeSlot, useChromeProfile } = req.body;
    
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

    automationProcess.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.log(`[${automationId}] ${message}`);
      
      // Check for completion signals
      if (message.includes('Payment URL:')) {
        const urlMatch = message.match(/Payment URL: (https?:\/\/[^\s]+)/);
        if (urlMatch) {
          const paymentUrl = urlMatch[1];
          activeAutomations.get(automationId).result = { paymentUrl, success: true };
          activeAutomations.get(automationId).status = 'completed';
        }
      }
      
      // Check for server-specific payment URL output
      if (message.includes('PAYMENT_URL_OUTPUT:')) {
        const paymentUrl = message.replace('PAYMENT_URL_OUTPUT:', '').trim();
        activeAutomations.get(automationId).result = { paymentUrl, success: true };
        activeAutomations.get(automationId).status = 'completed';
      }
      
      if (message.includes('Booking process completed!')) {
        activeAutomations.get(automationId).status = 'completed';
      }
    });

    automationProcess.stderr.on('data', (data) => {
      const error = data.toString();
      errorOutput += error;
      console.error(`[${automationId}] ERROR: ${error}`);
    });

    automationProcess.on('close', (code) => {
      console.log(`[${automationId}] Process exited with code ${code}`);
      
      const automation = activeAutomations.get(automationId);
      if (automation) {
        automation.status = code === 0 ? 'completed' : 'failed';
        if (code !== 0) {
          automation.result = { error: `Process failed with code ${code}`, success: false };
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
