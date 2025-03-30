# DDA Sports Booking Desktop Application

A desktop application for automating the DDA Sports booking process. This application provides a user-friendly interface to enter your credentials and booking details, and then automates the booking process while showing you the progress in real-time.

## Features

- User-friendly interface for entering booking details
- Real-time automation process with visible browser window
- Automatic CAPTCHA solving
- Error handling and retry mechanisms
- Desktop-only application (Windows, macOS, and Linux)

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Chrome browser installed
- Desktop computer (Windows, macOS, or Linux)

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
5. Find the built application in the `dist` folder:
   - Windows: `dist/win-unpacked/DDA Sports Booking.exe`
   - macOS: `dist/mac/DDA Sports Booking.app`
   - Linux: `dist/linux-unpacked/dda-sports-booking`

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

The built application will be available in the `dist` directory.

## Usage

1. Launch the application on your desktop computer
2. Enter your DDA Sports credentials:
   - Username
   - Password
3. Enter the booking details:
   - Date (in DD/MM/YYYY format)
   - Court Number
4. Click "Start Booking Process"
5. Watch the automation process in the new window that opens
6. Complete the payment process when prompted

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

## Security

- Credentials are only used locally on your device
- No data is sent to external servers except for the DDA Sports website
- The application runs entirely on your local machine

## License

ISC
