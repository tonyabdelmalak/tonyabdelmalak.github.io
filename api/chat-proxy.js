export default async function handler(req, res) {
  // Allow any origin and the Content‑Type header for simple CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Enforce that only POST requests are processed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Destructure request body with sensible defaults
    const {
      messages = [],
      model = 'gpt-3.5-turbo',
      max_tokens = 300,
      temperature = 0.7,
    } = req.body || {};

    // Always use Groq API
    const apiKey = process.env.GROQ_API_KEY;
    const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // Build headers including the Bearer token for Groq
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    // Assemble payload for the chat completion request
    const payload = {
      model,
      messages,
      max_tokens,
      temperature,
    };

    // Make the request to Groq
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    // Surface any non‑200 responses with the returned error text
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy request failed: ${response.status} ${errorText}`);
    }

    // Relay the JSON response back to the caller
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    // Log and return any unexpected errors
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
}
