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

    // Look for the most recent user message and convert it to lowercase
    const lastUserMsg =
      [...messages].reverse().find(m => m.role === 'user')?.content?.toLowerCase() || '';

    // Predefined answer: attrition by department
    if (lastUserMsg.includes('attrition') && lastUserMsg.includes('department')) {
      const content =
        'Attrition rates by department: HR 8%, Engineering 12%, Sales 9%, Marketing 7%, Finance 10%.\n' +
        'These figures highlight high‑turnover areas and guide retention strategies.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: ticket sales numbers
    if (
      lastUserMsg.includes('ticket sales') ||
      (lastUserMsg.includes('ticket') && (lastUserMsg.includes('sales') || lastUserMsg.includes('sold')))
    ) {
      const content =
        'Ticket sales: Concerts 5k, Sports 4k, Theatre 3k, Conferences 2k.\n' +
        'This data informs marketing focus and capacity planning.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: Tony’s career pivot
    if (
      lastUserMsg.includes('pivot') ||
      (lastUserMsg.includes('career') && lastUserMsg.includes('analytics'))
    ) {
      const content =
        'Tony pivoted from HR operations to AI‑driven analytics, leveraging Tableau, SQL and Python.\n' +
        'He now translates HR and business data into executive‑ready insights and predictive models.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: workforce forecasting impact
    if (
      lastUserMsg.includes('forecast') &&
      (lastUserMsg.includes('impact') || lastUserMsg.includes('project'))
    ) {
      const content =
        'Workforce forecasting improved budgeting and capacity planning accuracy by 25%.\n' +
        'It provided scenario‑based projections, enabling proactive hiring and reducing overtime costs.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: personal bio / “tell me about yourself”
    if (
      lastUserMsg.includes('tell me about yourself') ||
      lastUserMsg.includes('about yourself')
    ) {
      const content =
        'I’m Tony Abdelmalak, an HR and analytics professional who pivoted into AI‑driven people analytics after roles at HBO, Sony, NBC, and a startup. I specialize in workforce data and executive‑ready insights.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Predefined answer: personal questions (e.g. “Are you married?”)
    if (
      lastUserMsg.includes('are you married') ||
      lastUserMsg.includes('married') ||
      lastUserMsg.includes('personal')
    ) {
      const content =
        'I don’t discuss my personal life or marital status; let’s focus on my work experience and projects in HR analytics and AI.';
      return res.status(200).json({
        choices: [{ message: { role: 'assistant', content } }],
      });
    }

    // Otherwise, forward the request to Groq with all messages
    
        if (!process.env.GROQ_API_KEY) {
      return res.status(200).json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Sorry, the assistant is not available at the moment.',
            },
          },
        ],
      });
    }
        // Guard against missing API key; return a friendly message instead of error
    if (!process.env.GROQ_API_KEY) {
      return res.status(200).json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Sorry, the assistant is not available at the moment.',
            },
          },
        ],
      });
    }

const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        messages,
        model,
        max_tokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: errBody });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    // Catch and return unexpected errors
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
