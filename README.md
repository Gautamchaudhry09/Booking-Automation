# DDA Sports Booking Desktop Application

A desktop application for automating the DDA Sports booking process. This application provides a user-friendly interface to enter your credentials and booking details, and then automates the booking process while showing you the progress in real-time.

## Features

- User-friendly interface for entering booking details
- Real-time automation process with visible browser window
- Automatic CAPTCHA solving
- Error handling and retry mechanisms
- Profile management to save and reuse booking settings
- Device authentication for security
- Chrome profile integration to save login sessions and cookies
- Desktop-only application (Windows, macOS, and Linux)

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Chrome browser installed
- Desktop computer (Windows, macOS, or Linux)
- Internet connection (for authentication)

## Installation

### Option 1: Download Pre-built Application

1. Go to the releases section of this repository
2. Download the appropriate version for your operating system:
   - Windows: `DDA-Sports-Booking-Setup.exe`
   - macOS: `DDA-Sports-Booking.dmg`
   - Linux: `dda-sports-booking.AppImage`
3. Run the installer and follow the installation wizard

### Option 2: Build from Source

1. Clone this repository or download the source code
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the application:
   ```bash
   npm run build
   ```
5. Find the built application in the output folder

## Development

To run the application in development mode:

```bash
npm start
```

## Building the Application

To create a distributable package:

```bash
npm run build
```

## Usage

1. Launch the application on your desktop computer
2. Enter your DDA Sports credentials:
   - Username
   - Password
3. Enter the booking details:
   - Date (in DD/MM/YYYY format)
   - Court Number
   - Time Slot
4. Optionally enable "Use Chrome profile data" to save your login session
5. Click "Start Booking Process" to begin, or save as a profile for later use
6. Watch the automation process in the new window that opens
7. Complete the payment process when prompted

### Profile Management

The application includes profile management capabilities:

- **Save Profile**: Enter your booking details and save them as a named profile
- **Load Profile**: Click on a saved profile to load its settings
- **Edit Profile**: Update date, court number, and time slot for a saved profile
- **Execute Profile**: Run the booking automation with a saved profile
- **Delete Profile**: Remove a saved profile when no longer needed

## Authentication System

This application uses a device-based authentication system with centralized access control:

- **Device Registration**: Each device generates a unique token based on hardware information and hostname
- **One-time Registration**: Devices are registered in the database only once by their hostname
- **Access Control**: Each device entry has a `userAccess` boolean field that can be toggled by administrators
- **Access Revocation**: Administrators can revoke access to specific devices by setting `userAccess` to false
- **Usage Tracking**: The system records the creation date and last login time for each device

### For Administrators

To manage user access:

1. Access the MongoDB database (Cluster0)
2. Navigate to the "AuthenticatedSystem" collection
3. Find the device entry by hostname or deviceToken
4. Update the `userAccess` field:
   - `true` to allow the device to use the application
   - `false` to revoke access

This allows centralized management of which devices can run the automation without requiring users to reinstall or modify the application.

## Notes

- This is a desktop-only application and will not work on mobile devices
- The application will open a visible Chrome window during the automation process
- You can see the progress of the booking in real-time
- The window will remain open after booking completion for payment processing
- If any errors occur, they will be displayed in the main application window

## Troubleshooting

If you encounter any issues:

1. Make sure all prerequisites are installed
2. Check your internet connection
3. Verify your credentials are correct
4. Ensure the date format is correct (DD/MM/YYYY)
5. Check if the court number is available for the selected date
6. If you see "Device authentication failed", contact the administrator

## Security

- Credentials are only used locally on your device
- Device tokens are securely stored in a MongoDB database
- The Chrome profile option allows saving sessions between runs
- No data is sent to external servers except for the DDA Sports website and authentication
- The application runs entirely on your local machine

## License

ISC
