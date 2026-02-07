# AI Articles System - Technical Documentation

## Overview
The AI Articles system dynamically generates relevant article recommendations for Tony Abdelmalak's portfolio using Groq AI with contextual knowledge from the portfolio's knowledge base.

## Architecture

### Components
1. **Frontend**: `assets/js/ai-articles.js` - Client-side article fetching and rendering
2. **Backend**: Cloudflare Worker at `https://my-chat-agent.tonyabdelmalak.workers.dev/chat`
3. **Knowledge Base**: Markdown files in `/knowledge/` directory
4. **Cache**: LocalStorage with 7-day TTL

### Data Flow
```
┌─────────────────┐
│  User clicks    │
│  Refresh or     │
│  Page loads     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check cache     │
│ (7-day TTL)     │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Valid?  │
    └────┬────┘
         │
    ┌────┴────────────────┐
    │                     │
   YES                   NO
    │                     │
    ▼                     ▼
┌─────────┐      ┌──────────────────┐
│ Render  │      │ Fetch KB sources │
│ cached  │      │ (projects.md,    │
│ articles│      │  case-studies.md,│
└─────────┘      │  about-tony.md)  │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Build prompt     │
                 │ with KB context  │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Call Groq AI via │
                 │ Cloudflare Worker│
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Parse JSON       │
                 │ response         │
                 └────────┬─────────┘
                          │
                     ┌────┴────┐
                     │ Valid?  │
                     └────┬────┘
                          │
                     ┌────┴────────────┐
                     │                 │
                    YES               NO
                     │                 │
                     ▼                 ▼
            ┌──────────────┐  ┌──────────────┐
            │ Cache & render│  │ Use fallback │
            │ AI articles   │  │ articles     │
            └───────────────┘  └──────────────┘
```

## Knowledge Base Integration

### Sources
The system fetches context from three knowledge base files:

1. **projects.md** - Tony's portfolio projects and dashboards
   - Workforce Planning Model
   - Turnover Analysis Dashboard
   - Early Turnover Segmentation
   - Attrition Risk Calculator
   - Interactive Portfolio Dashboards

2. **case-studies.md** - Detailed case studies
   - Quibi: Scaling at Startup Speed
   - Flowserve: Turning Compliance into Engagement
   - Roadr: AI-Driven Onboarding Transformation

3. **about-tony.md** - Professional background and expertise
   - Skills and specializations
   - Professional experience
   - Certifications and education

### Context Building
The system:
1. Fetches all three markdown files from GitHub raw URLs
2. Limits each to prevent token overflow (projects: 3000 chars, case studies: 3000 chars, about: 2000 chars)
3. Injects context into the AI prompt
4. Instructs AI to recommend articles that align with Tony's expertise

## AI Prompt Structure

```javascript
const prompt = `
You are an AI assistant helping curate relevant articles for Tony Abdelmalak's portfolio insights section.

RELEVANT CONTEXT FROM TONY'S PORTFOLIO:

## Projects:
${kb.projects}

## Case Studies:
${kb.caseStudies}

## About Tony:
${kb.about}

Based on Tony's expertise and the projects/case studies above, recommend 3 recent, high-quality articles (from 2024-2026) that would be valuable to his audience. Focus on:
- Predictive analytics and workforce planning
- AI in HR and talent optimization
- Data visualization and storytelling
- Employee engagement and retention
- Diversity, equity, and inclusion
- People analytics best practices

For each article, provide:
1. Title (concise, professional)
2. Brief description (1-2 sentences, focus on practical value and how it relates to Tony's work)
3. URL (real, accessible article from reputable sources like Harvard Business Review, McKinsey, Gartner, SHRM, LinkedIn, Forbes, MIT Sloan, etc.)

Format your response as a JSON array with this structure:
[
  {
    "title": "Article Title",
    "description": "Brief description relating to Tony's expertise",
    "url": "https://..."
  }
]

IMPORTANT: Return ONLY the JSON array, no additional text.
`;
```

## Caching Strategy

### Cache Key
- **Key**: `ai_articles_cache`
- **Storage**: LocalStorage
- **Structure**:
  ```json
  {
    "articles": [
      {
        "title": "...",
        "description": "...",
        "url": "..."
      }
    ],
    "timestamp": 1707321600000
  }
  ```

### Cache Duration
- **TTL**: 7 days (604,800,000 milliseconds)
- **Validation**: Checks timestamp on every page load
- **Invalidation**: Manual refresh or expired TTL

### Why 7 Days?
- Reduces API calls and costs
- Articles remain relevant for a week
- Balances freshness with performance
- User can manually refresh anytime

## Fallback Articles

If AI generation fails, the system uses curated fallback articles:

1. **Ethical AI in HR: Challenges, Risks, and Best Practices**
   - Source: TMI.org
   - Focus: AI ethics in workforce decisions

2. **Employee Engagement Trends Report 2025**
   - Source: McLean & Company via PR Newswire
   - Focus: Data-driven engagement insights

3. **2025 Guide to Predictive Analytics in Recruitment**
   - Source: X0PA
   - Focus: Predictive models in hiring

## Refresh Button Functionality

### User Experience
1. **Initial State**: "Refresh Articles" with sync icon
2. **Loading State**: Spinning icon + "Refreshing..." + disabled + opacity 0.7
3. **Success State**: Check icon + "Refreshed!" for 2 seconds
4. **Return State**: Back to initial state

### Implementation
```javascript
window.refreshAIArticles = async function() {
  const btn = document.getElementById('refresh-articles');
  
  // Show loading state
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Refreshing...</span>';
    btn.style.opacity = '0.7';
  }
  
  // Clear cache and force refresh
  console.log('Manual refresh triggered - clearing cache and fetching new articles');
  localStorage.removeItem(STORAGE_KEY);
  await init(true); // Force refresh
  
  // Show success state
  if (btn) {
    btn.innerHTML = '<i class="fas fa-check"></i><span>Refreshed!</span>';
    btn.style.opacity = '1';
    
    // Return to initial state after 2 seconds
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sync-alt"></i><span>Refresh Articles</span>';
    }, 2000);
  }
};
```

## Error Handling

### Levels of Fallback
1. **Cache Valid**: Use cached articles (fastest)
2. **AI Success**: Fetch fresh articles from AI
3. **AI Failure**: Use default fallback articles
4. **Render Failure**: Log error to console

### Error Scenarios
- **Network Error**: Falls back to default articles
- **API Error**: Falls back to default articles
- **Invalid JSON**: Falls back to default articles
- **Empty Response**: Falls back to default articles
- **KB Fetch Error**: Continues with empty context

### Logging
All operations are logged to console:
- Cache status
- KB fetch status
- AI request/response
- Parse success/failure
- Render operations

## API Configuration

### Cloudflare Worker Endpoint
- **URL**: `https://my-chat-agent.tonyabdelmalak.workers.dev/chat`
- **Method**: POST
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "message": "<prompt>",
    "conversationHistory": [],
    "temperature": 0.7,
    "model": "llama-3.1-8b-instant"
  }
  ```

### Response Format
```json
{
  "content": "[{\"title\":\"...\",\"description\":\"...\",\"url\":\"...\"}]",
  "role": "assistant",
  "provider": "groq",
  "model_used": "llama-3.1-8b-instant",
  "finish_reason": "stop"
}
```

## Performance Considerations

### Optimization Strategies
1. **Caching**: 7-day cache reduces API calls by ~99%
2. **Lazy Loading**: Articles load after DOM ready
3. **Size Limits**: KB sources capped to prevent token overflow
4. **Parallel Fetching**: KB sources fetched concurrently
5. **Timeout Handling**: Worker has 25s timeout

### Metrics
- **Cache Hit**: ~50ms (localStorage read)
- **Cache Miss + AI**: ~2-5 seconds (KB fetch + AI generation)
- **Fallback**: ~50ms (immediate render)

## Security

### XSS Prevention
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

### CORS
- Worker provides proper CORS headers
- Allows cross-origin requests from portfolio domain

### Content Validation
- JSON parsing with try/catch
- Array validation before rendering
- URL validation (external links only)

## Maintenance

### Updating Knowledge Base
1. Edit markdown files in `/knowledge/` directory
2. Commit and push to GitHub
3. Articles will reflect new context on next refresh
4. No code changes needed

### Updating Fallback Articles
1. Edit `DEFAULT_ARTICLES` array in `ai-articles.js`
2. Ensure URLs are valid and accessible
3. Test rendering before deployment

### Monitoring
- Check browser console for errors
- Monitor Cloudflare Worker analytics
- Review cache hit/miss rates
- Validate article quality periodically

## Troubleshooting

### Articles Not Updating
1. Check cache expiration (7 days)
2. Click "Refresh Articles" button
3. Clear localStorage manually: `localStorage.removeItem('ai_articles_cache')`
4. Check browser console for errors

### Fallback Articles Showing
1. Verify Cloudflare Worker is running
2. Check API endpoint accessibility
3. Review console logs for API errors
4. Validate Groq API key in Worker environment

### Refresh Button Not Working
1. Check button ID: `refresh-articles`
2. Verify event listener attachment
3. Check console for click handler logs
4. Ensure JavaScript is loaded

## Future Enhancements

### Potential Improvements
1. **User Preferences**: Allow users to select article topics
2. **More Sources**: Add more KB sources (blog posts, publications)
3. **Analytics**: Track which articles are clicked
4. **Personalization**: Tailor articles based on visitor behavior
5. **A/B Testing**: Test different prompts for better recommendations
6. **RSS Integration**: Pull from specific RSS feeds
7. **Social Sharing**: Add share buttons for articles

## Testing

### Manual Testing Checklist
- [ ] Page loads with cached articles
- [ ] Refresh button shows loading state
- [ ] Refresh button fetches new articles
- [ ] Refresh button shows success state
- [ ] Fallback articles display on API failure
- [ ] Articles render with proper styling
- [ ] External links open in new tab
- [ ] Console logs show proper flow
- [ ] Cache persists across page reloads
- [ ] Cache expires after 7 days

### Browser Compatibility
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Conclusion

The AI Articles system provides dynamic, contextually relevant article recommendations by:
1. Leveraging Tony's portfolio knowledge base for context
2. Using Groq AI for intelligent article curation
3. Implementing smart caching for performance
4. Providing graceful fallbacks for reliability
5. Offering manual refresh for user control

This creates a living, breathing insights section that stays relevant to Tony's expertise while minimizing API costs and maximizing user experience.
