export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from the request body, with defaults
    const {
      messages = [],
      model = 'gpt-3.5-turbo',
      max_tokens = 300,
      temperature = 0.7,
    } = req.body || {};

    // Choose API based on available environment variables
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    const usingOpenAI = !!process.env.OPENAI_API_KEY;
    const apiUrl = usingOpenAI
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://api.groq.com/openai/v1/chat/completions';
    const authorizationHeader = usingOpenAI
      ? `Bearer ${process.env.OPENAI_API_KEY}`
      : `Bearer ${process.env.GROQ_API_KEY}`;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: authorizationHeader,
    };

    const payload = {
      model,
      messages,
      max_tokens,
      temperature,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
}
