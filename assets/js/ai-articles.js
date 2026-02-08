/**
 * AI-Powered Rotating Articles
 * Fetches fresh article recommendations using Groq AI with knowledge base context
 * Tony Abdelmalak Portfolio - 2026
 */

(function() {
  'use strict';

  const CHAT_API_URL = 'https://my-chat-agent.tonyabdelmalak.workers.dev/chat';
  const STORAGE_KEY = 'ai_articles_cache';
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  // Knowledge base sources for context
  const KNOWLEDGE_SOURCES = {
    projects: 'https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/knowledge/projects.md',
    caseStudies: 'https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/knowledge/case-studies.md',
    about: 'https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/knowledge/about-tony.md'
  };

  // Additional article sources for variety
  const ARTICLE_TOPICS = [
    'predictive analytics in workforce planning',
    'AI-driven talent optimization',
    'employee retention strategies using data',
    'diversity and inclusion metrics',
    'people analytics best practices',
    'HR dashboard design and visualization',
    'machine learning for recruitment',
    'employee engagement measurement',
    'workforce forecasting techniques',
    'data storytelling in HR'
  ];

  // Default fallback articles
  const DEFAULT_ARTICLES = [
    {
      title: 'Ethical AI in HR: Challenges, Risks, and Best Practices',
      description: 'Explore ethical considerations when using AI for workforce decisions and learn strategies to promote fairness and transparency.',
      url: 'https://www.shrm.org/topics-tools/news/technology/how-ai-transforming-hr'
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
   * Fetch knowledge base content for context
   */
  async function fetchKnowledgeBase() {
    try {
      const [projects, caseStudies, about] = await Promise.all([
        fetch(KNOWLEDGE_SOURCES.projects).then(r => r.ok ? r.text() : ''),
        fetch(KNOWLEDGE_SOURCES.caseStudies).then(r => r.ok ? r.text() : ''),
        fetch(KNOWLEDGE_SOURCES.about).then(r => r.ok ? r.text() : '')
      ]);

      return {
        projects: projects.slice(0, 3000), // Limit size
        caseStudies: caseStudies.slice(0, 3000),
        about: about.slice(0, 2000)
      };
    } catch (error) {
      console.error('Error fetching knowledge base:', error);
      return { projects: '', caseStudies: '', about: '' };
    }
  }

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
   * Fetch fresh articles from AI with knowledge base context
   */
  async function fetchAIArticles() {
    try {
      console.log('Fetching knowledge base for context...');
      const kb = await fetchKnowledgeBase();

      const contextPrompt = `
RELEVANT CONTEXT FROM TONY'S PORTFOLIO:

## Projects:
${kb.projects}

## Case Studies:
${kb.caseStudies}

## About Tony:
${kb.about}
`;

      // Generate random seed for variety
      const timestamp = Date.now();
      const randomTopic = ARTICLE_TOPICS[Math.floor(Math.random() * ARTICLE_TOPICS.length)];
      const randomYear = 2024 + Math.floor(Math.random() * 3); // 2024-2026

      const prompt = `You are an AI assistant helping curate relevant articles for Tony Abdelmalak's portfolio insights section.

${contextPrompt}

Based on Tony's expertise and the projects/case studies above, recommend 3 DIFFERENT recent, high-quality articles (from ${randomYear}-2026) that would be valuable to his audience.

FOCUS THIS TIME ON: ${randomTopic}

Also consider these areas:
- Predictive analytics and workforce planning
- AI in HR and talent optimization
- Data visualization and storytelling
- Employee engagement and retention
- Diversity, equity, and inclusion
- People analytics best practices

For each article, provide:
1. Title (concise, professional)
2. Brief description (1-2 sentences, focus on practical value and how it relates to Tony's work)
3. URL (real, accessible article from reputable sources like Harvard Business Review, McKinsey, Gartner, SHRM, LinkedIn, Forbes, MIT Sloan, Deloitte, PwC, BCG, etc.)

IMPORTANT: 
- Each refresh should return DIFFERENT articles (use timestamp seed: ${timestamp})
- Vary the sources and topics
- Focus on practical, actionable insights
- Ensure URLs are real and accessible

Format your response as a JSON array with this structure:
[
  {
    "title": "Article Title",
    "description": "Brief description relating to Tony's expertise",
    "url": "https://..."
  }
]

IMPORTANT: Return ONLY the JSON array, no additional text.`;

      console.log('Requesting AI article recommendations from:', CHAT_API_URL);
      console.log('Prompt length:', prompt.length, 'characters');
      
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.9, // Higher temperature for more variety
          model: 'llama-3.1-8b-instant',
          stream: false
        })
      });

      console.log('Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Full API response:', data);
      const content = data.content || data.response || data.message || '';
      console.log('AI response content (first 500 chars):', content.slice(0, 500));

      // Try to parse JSON from the response
      const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const articles = JSON.parse(jsonMatch[0]);
        if (Array.isArray(articles) && articles.length > 0) {
          console.log('Successfully parsed', articles.length, 'articles');
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
    if (!track) {
      console.error('insights-track element not found');
      return;
    }

    console.log('Rendering articles:', articles);
    track.innerHTML = articles.map(article => `
      <div class="carousel-card">
        <h4>${escapeHtml(article.title)}</h4>
        <p>${escapeHtml(article.description)}</p>
        <a href="${escapeHtml(article.url)}" 
           class="btn btn-sm" 
           style="background-color: var(--accent-color); color:#fff;"
           target="_blank"
           rel="noopener noreferrer">
          <i class="fas fa-external-link-alt"></i> Read Article
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
  async function init(forceRefresh = false) {
    console.log(`Init called with forceRefresh=${forceRefresh}`);
    
    // Check if cache is valid (unless forcing refresh)
    if (!forceRefresh && isCacheValid()) {
      const cached = getCachedArticles();
      if (cached) {
        console.log('Using cached articles:', cached.length, 'articles');
        renderArticles(cached);
        return;
      }
    }

    if (forceRefresh) {
      console.log('Force refresh enabled - bypassing cache');
    }

    // Try to fetch fresh articles
    console.log('Fetching fresh articles from AI...');
    const aiArticles = await fetchAIArticles();

    if (aiArticles && aiArticles.length > 0) {
      console.log('Successfully fetched', aiArticles.length, 'AI articles:', aiArticles);
      cacheArticles(aiArticles);
      renderArticles(aiArticles);
    } else {
      console.warn('AI fetch failed or returned no articles. Using default fallback articles');
      renderArticles(DEFAULT_ARTICLES);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(false));
  } else {
    init(false);
  }

  // Expose refresh function globally for manual refresh
  window.refreshAIArticles = async function() {
    console.log('=== REFRESH BUTTON CLICKED ===');
    const btn = document.getElementById('refresh-articles');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Refreshing...</span>';
      btn.style.opacity = '0.7';
      console.log('Button UI updated to loading state');
    } else {
      console.error('Refresh button not found!');
    }
    
    console.log('Clearing cache...');
    localStorage.removeItem(STORAGE_KEY);
    console.log('Cache cleared. Fetching new articles...');
    
    try {
      await init(true); // Force refresh
      console.log('Init completed successfully');
    } catch (error) {
      console.error('Error during init:', error);
    }
    
    if (btn) {
      btn.innerHTML = '<i class="fas fa-check"></i><span>Refreshed!</span>';
      btn.style.opacity = '1';
      console.log('Button UI updated to success state');
      
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i><span>Refresh Articles</span>';
        console.log('Button UI reset to initial state');
      }, 2000);
    }
    console.log('=== REFRESH COMPLETE ===');
  };
  
  // Wire up refresh button
  document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-articles');
    if (refreshBtn) {
      console.log('Refresh button found, attaching click handler');
      refreshBtn.addEventListener('click', window.refreshAIArticles);
    } else {
      console.warn('Refresh button not found in DOM');
    }
  });

})();
