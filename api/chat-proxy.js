export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from the request body, with defaults
    const {
      messages = [],
      model = 'llama3-8b-8192',
      max_tokens = 300,
      temperature = 0.7,
    } = req.body || {};

    // Choose API based on available environment variables
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    const apiUrl =
      process.env.OPENAI_API_KEY
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions';

    // If no API key is configured, return an error
    if (!apiKey) {
      return res.status(503).json({ error: 'No API key configured' });
    }

    // Forward the request to the selected API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages,
        model,
        max_tokens,
        temperature,
      }),
    });

    // If the external API responds with an error, relay it
    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: errorData });
    }

    // Return the successful response from the external API
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
