import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import axios from 'axios';

/**
 * Solve CAPTCHA using Google's Gemini API
 * @param {string} imagePath - Path to the CAPTCHA image file
 * @returns {Promise<string|null>} The solved CAPTCHA text or null if failed
 */
async function solveCaptchaWithGemini(imagePath) {
  try {
    // Read service account file
    const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

    // Initialize GoogleAuth
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/generative-language.retriever'],
    });

    // Get access token
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // Read and encode the image
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // Prepare the payload
    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Read and return ONLY the text characters from this CAPTCHA image. Do not include any explanations, punctuation, or additional text. Just the characters."
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 20,
      }
    };

    // Make API request
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    // Extract and return the response
    if (response.data && response.data.candidates && response.data.candidates[0]) {
      const captchaText = response.data.candidates[0].content.parts[0].text;
      return captchaText.trim().replace(/[^a-zA-Z0-9]/g, '');
    }

    return null;

  } catch (error) {
    console.error('Error solving CAPTCHA:', error.message);
    return null;
  }
}

// Export function for use in other modules
export { solveCaptchaWithGemini };
