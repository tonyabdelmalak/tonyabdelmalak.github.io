/**
 * AI-Powered Rotating Articles
 * Fetches fresh article recommendations weekly using Groq AI
 * Tony Abdelmalak Portfolio - 2026
 */

(function() {
  'use strict';

  const CHAT_API_URL = 'https://my-chat-agent.tonyabdelmalak.workers.dev/chat';
  const STORAGE_KEY = 'ai_articles_cache';
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  // Default fallback articles
  const DEFAULT_ARTICLES = [
    {
      title: 'Ethical AI in HR: Challenges, Risks, and Best Practices',
      description: 'Explore ethical considerations when using AI for workforce decisions and learn strategies to promote fairness and transparency.',
      url: 'https://www.tmi.org/blogs/ethical-ai-in-hr-challenges-risks-and-best-practices'
    },
    {
      title: 'Employee Engagement Trends Report 2025',
      description: 'Discover how data‑driven insights can help boost engagement, retention and well‑being across your organisation.',
      url: 'https://www.prnewswire.com/news-releases/employee-engagement-trends-report-2025-mclean--company-publishes-new-research-on-shifts-shaping-the-workplace-302411049.html'
    },
    {
      title: '2025 Guide to Predictive Analytics in Recruitment',
      description: 'Learn how to apply predictive models to optimise hiring funnels, reduce time‑to‑fill and improve candidate quality.',
      url: 'https://x0pa.com/blog/2025-guide-to-predictive-analytics-in-recruitment/'
    }
  ];

  /**
   * Check if cached articles are still valid
   */
  function isCacheValid() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (!cached) return false;

      const { timestamp } = JSON.parse(cached);
      const now = Date.now();
      return (now - timestamp) < CACHE_DURATION;
    } catch (error) {
      console.error('Error checking cache:', error);
      return false;
    }
  }

  /**
   * Get cached articles
   */
  function getCachedArticles() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (!cached) return null;

      const { articles } = JSON.parse(cached);
      return articles;
    } catch (error) {
      console.error('Error getting cached articles:', error);
      return null;
    }
  }

  /**
   * Save articles to cache
   */
  function cacheArticles(articles) {
    try {
      const data = {
        articles,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error caching articles:', error);
    }
  }

  /**
   * Fetch fresh articles from AI
   */
  async function fetchAIArticles() {
    try {
      const prompt = `You are an AI assistant helping curate relevant articles for Tony Abdelmalak's portfolio. 

Tony is an AI-Driven People & Business Insights Analyst specializing in:
- Predictive analytics and workforce planning
- AI in HR and talent optimization
- Data visualization and storytelling
- Employee engagement and retention
- Diversity, equity, and inclusion

Please recommend 3 recent, high-quality articles (from 2024-2026) related to these topics. For each article, provide:
1. Title (concise, professional)
2. Brief description (1-2 sentences, focus on practical value)
3. URL (real, accessible article from reputable sources like Harvard Business Review, McKinsey, Gartner, LinkedIn, Forbes, etc.)

Format your response as a JSON array with this structure:
[
  {
    "title": "Article Title",
    "description": "Brief description",
    "url": "https://..."
  }
]

IMPORTANT: Return ONLY the JSON array, no additional text.`;

      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: prompt,
          conversationHistory: []
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.response || data.message || '';

      // Try to parse JSON from the response
      const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const articles = JSON.parse(jsonMatch[0]);
        if (Array.isArray(articles) && articles.length > 0) {
          return articles.slice(0, 3); // Ensure max 3 articles
        }
      }

      throw new Error('Invalid response format');
    } catch (error) {
      console.error('Error fetching AI articles:', error);
      return null;
    }
  }

  /**
   * Render articles to the carousel
   */
  function renderArticles(articles) {
    const track = document.getElementById('insights-track');
    if (!track) return;

    track.innerHTML = articles.map(article => `
      <div class="carousel-card">
        <h4>${escapeHtml(article.title)}</h4>
        <p>${escapeHtml(article.description)}</p>
        <a href="${escapeHtml(article.url)}" 
           class="btn btn-sm" 
           style="background-color: var(--accent-color); color:#fff;"
           target="_blank"
           rel="noopener noreferrer">
          Read More
        </a>
      </div>
    `).join('');
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Initialize AI articles
   */
  async function init() {
    // Check if cache is valid
    if (isCacheValid()) {
      const cached = getCachedArticles();
      if (cached) {
        console.log('Using cached articles');
        renderArticles(cached);
        return;
      }
    }

    // Try to fetch fresh articles
    console.log('Fetching fresh articles from AI...');
    const aiArticles = await fetchAIArticles();

    if (aiArticles) {
      console.log('Successfully fetched AI articles');
      cacheArticles(aiArticles);
      renderArticles(aiArticles);
    } else {
      console.log('Using default fallback articles');
      renderArticles(DEFAULT_ARTICLES);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose refresh function globally for manual refresh
  window.refreshAIArticles = async function() {
    localStorage.removeItem(STORAGE_KEY);
    await init();
  };

})();
