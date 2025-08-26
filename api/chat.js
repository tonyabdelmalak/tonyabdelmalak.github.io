export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      messages = [],
      model = 'llama3-8b-8192',
      max_tokens = 300,
      temperature = 0.7,
    } = req.body || {};

    // Get the latest user message (in lower case) to look for keywords
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content?.toLowerCase() || '';

    // Predefined answer: attrition by department
    if (lastUserMsg.includes('attrition') && lastUserMsg.includes('department')) {
      const content =
        '• Attrition rates by department: HR 8%, Engineering 12%, Sales 9%, Marketing 7%, Finance 10%.\n' +
        '• These figures highlight high-turnover areas and guide retention strategies.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: ticket sales
    if (
      lastUserMsg.includes('ticket sales') ||
      (lastUserMsg.includes('ticket') && (lastUserMsg.includes('sales') || lastUserMsg.includes('sold')))
    ) {
      const content =
        '• Ticket sales: Concerts 5k, Sports 4k, Theatre 3k, Conferences 2k.\n' +
        '• This data informs marketing focus and capacity planning.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: Tony’s career pivot
    if (lastUserMsg.includes('pivot') || (lastUserMsg.includes('career') && lastUserMsg.includes('analytics'))) {
      const content =
        '• Tony pivoted from HR operations to AI‑driven analytics, leveraging Tableau, SQL and Python.\n' +
        '• He now translates HR and business data into executive-ready insights and predictive models.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: workforce forecasting impact
    if (lastUserMsg.includes('forecast') && (lastUserMsg.includes('impact') || lastUserMsg.includes('project'))) {
      const content =
        '• Workforce forecasting improved budgeting and capacity planning accuracy by 25%.\n' +
        '• It provided scenario‑based projections, enabling proactive hiring and reducing overtime costs.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Otherwise, forward the request to Groq with the provided system/user messages
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({ messages, model, max_tokens, temperature }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: errBody });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
