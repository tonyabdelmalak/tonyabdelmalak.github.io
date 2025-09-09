export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages = [], model = 'gpt-4o', temperature = 0.7, max_tokens = 300 } = req.body || {};
    // Build the request body for OpenAI
    const body = {
      model,
      messages,
      max_tokens,
      temperature
    };

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`
      },
      body: JSON.stringify(body)
    });

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content || '';

    return res.status(200).json({
      message: content
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
