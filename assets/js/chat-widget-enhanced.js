/**
 * Enhanced AI Chat Widget for Tony Abdelmalak Portfolio
 * Connects to Cloudflare Worker backend for intelligent responses
 * Version: 2.0 - Modern UI with AI capabilities
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    // TODO: Replace with your Cloudflare Worker endpoint
    apiEndpoint: 'YOUR_CLOUDFLARE_WORKER_URL_HERE',
    maxRetries: 3,
    retryDelay: 1000,
    typingDelay: 50,
    fallbackMode: true // Use local responses if API fails
  };

  // State management
  const state = {
    isOpen: false,
    isTyping: false,
    conversationHistory: [],
    retryCount: 0
  };

  // DOM Elements (will be initialized)
  let elements = {};

  /**
   * Initialize chat widget
   */
  function initChat() {
    elements = {
      container: document.getElementById('hf-chat-container'),
      toggle: document.getElementById('hf-chat-toggle'),
      conversation: document.getElementById('hf-conversation'),
      input: document.getElementById('hf-input'),
      sendBtn: document.getElementById('hf-send-btn'),
      typingIndicator: createTypingIndicator()
    };

    if (!elements.container || !elements.toggle) {
      console.error('Chat widget elements not found');
      return;
    }

    // Add typing indicator to conversation
    if (elements.conversation) {
      elements.conversation.appendChild(elements.typingIndicator);
    }

    // Event listeners
    elements.toggle?.addEventListener('click', toggleChat);
    elements.sendBtn?.addEventListener('click', handleSendMessage);
    elements.input?.addEventListener('keydown', handleKeyPress);

    // Welcome message
    setTimeout(() => {
      appendMessage('ai', "Hi! I'm Tony's AI assistant. I can answer questions about his work, skills, and projects. How can I help you today?");
    }, 500);

    // Add navbar scroll effect
    addNavbarScrollEffect();
  }

  /**
   * Toggle chat visibility
   */
  function toggleChat() {
    state.isOpen = !state.isOpen;
    if (elements.container) {
      elements.container.style.display = state.isOpen ? 'flex' : 'none';
      if (state.isOpen) {
        elements.input?.focus();
        // Mark as read
        elements.toggle?.classList.remove('has-notification');
      }
    }
  }

  /**
   * Handle send message
   */
  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    
    const message = elements.input?.value.trim();
    if (!message || state.isTyping) return;

    // Clear input
    if (elements.input) elements.input.value = '';

    // Add user message
    appendMessage('user', message);
    state.conversationHistory.push({ role: 'user', content: message });

    // Show typing indicator
    showTyping(true);

    try {
      // Try API first
      const response = await sendToAPI(message);
      showTyping(false);
      
      if (response) {
        await typeMessage('ai', response);
        state.conversationHistory.push({ role: 'ai', content: response });
        state.retryCount = 0;
      } else {
        throw new Error('Empty response from API');
      }
    } catch (error) {
      console.error('API Error:', error);
      showTyping(false);
      
      // Fallback to local responses
      if (CONFIG.fallbackMode) {
        const fallbackResponse = getLocalResponse(message);
        await typeMessage('ai', fallbackResponse);
        state.conversationHistory.push({ role: 'ai', content: fallbackResponse });
      } else {
        appendMessage('ai', "I'm having trouble connecting right now. Please try again in a moment or email Tony directly at tony.abdelmalak@yahoo.com");
      }
    }
  }

  /**
   * Send message to Cloudflare Worker API
   */
  async function sendToAPI(message) {
    // Check if API endpoint is configured
    if (CONFIG.apiEndpoint === 'YOUR_CLOUDFLARE_WORKER_URL_HERE') {
      console.warn('API endpoint not configured, using fallback mode');
      return null;
    }

    const response = await fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        history: state.conversationHistory.slice(-5) // Last 5 messages for context
      })
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    return data.response || data.message || null;
  }

  /**
   * Local fallback responses (enhanced with Tony's expertise)
   */
  function getLocalResponse(msg) {
    const text = msg.toLowerCase();

    // Attrition & HR Analytics
    if (text.includes('attrition')) {
      return "Tony specializes in attrition analysis! He's reduced attrition by 28% using predictive models that identify at-risk employees. His dashboards track turnover patterns by department, tenure, and engagement scores. Check out his case studies for detailed examples!";
    }

    // Predictive Analytics
    if (text.includes('predictive') || text.includes('forecast')) {
      return "Tony builds predictive models for workforce planning, attrition risk, and recruitment optimization. He uses Python, SQL, and machine learning to forecast headcount needs and identify retention risks before they become problems.";
    }

    // Tableau & Dashboards
    if (text.includes('tableau') || text.includes('dashboard') || text.includes('visualization')) {
      return "Tony creates executive-ready Tableau dashboards that transform complex HR data into actionable insights. His portfolio includes 8+ interactive dashboards covering turnover analysis, workforce planning, diversity metrics, and recruitment funnels. Want to see examples? Scroll to the Projects section!";
    }

    // AI & Tools
    if (text.includes('ai') || text.includes('tools') || text.includes('technology')) {
      return "Tony's tech stack includes: Tableau, Power BI, SQL, Python, AI tools (ChatGPT, Claude), and HRIS systems like Workday. He's certified in Applied AI for HR and uses generative AI ethically to enhance workforce analytics.";
    }

    // Skills
    if (text.includes('skill') || text.includes('experience') || text.includes('expertise')) {
      return "Tony combines HR operations expertise with technical analytics skills. He's proficient in Tableau, Power BI, SQL, Python, and AI tools. His unique background includes leading HR for major brands and startups, giving him deep insight into people strategy and data-driven decision-making.";
    }

    // Projects
    if (text.includes('project') || text.includes('work') || text.includes('portfolio')) {
      return "Tony's portfolio showcases 8+ analytics projects including: Yearly Turnover Analysis (9 years of data), Workforce Forecasting models, Recruitment Funnel Optimization (24% reduction in time-to-hire), and AI-powered Attrition Prediction. Each project demonstrates problem-solving with measurable business impact!";
    }

    // Results & Impact
    if (text.includes('result') || text.includes('impact') || text.includes('achievement')) {
      return "Tony's delivered impressive results: 28% reduction in attrition, 40% decrease in reporting effort, 17% increase in ramp-up speed, and 25% reduction in time-to-hire. His work translates data into executive-ready strategies that drive real business outcomes.";
    }

    // Contact & Hiring
    if (text.includes('hire') || text.includes('contact') || text.includes('email') || text.includes('reach')) {
      return "Interested in working with Tony? Email him at tony.abdelmalak@yahoo.com or connect on LinkedIn: linkedin.com/in/tony-abdelmalak. He's based in Los Angeles and excited to discuss how AI-driven analytics can transform your workforce strategy!";
    }

    // Resume
    if (text.includes('resume') || text.includes('cv') || text.includes('download')) {
      return "You can download Tony's full resume using the 'Download Resume' button in the navigation bar, or scroll to the Resume section at the bottom of the page. It includes detailed work history, certifications, and accomplishments.";
    }

    // About Tony
    if (text.includes('who') || text.includes('about') || text.includes('background')) {
      return "Tony is an AI-Driven People & Business Insights Analyst who believes data is about people. He transforms workforce analytics into human stories that empower decision-makers. After leading HR operations for major brands, he pivoted into AI-driven analytics, combining people-strategy expertise with technical skills.";
    }

    // Certifications
    if (text.includes('certif') || text.includes('training') || text.includes('education')) {
      return "Tony holds multiple certifications including: Applied AI for Human Resources, Creating Interactive Tableau Dashboards, Generative AI in HR, Using Generative AI Ethically at Work, and Effectively Leading Digital Transformation. He's also completed RAG Course for Beginners and is pursuing AI for HR: Workforce Planning & Talent Optimization.";
    }

    // Default response
    return "That's a great question! I can tell you about Tony's skills, projects, experience, and how he uses AI and analytics to solve workforce challenges. You can also email him directly at tony.abdelmalak@yahoo.com or explore his portfolio projects on this page. What would you like to know more about?";
  }

  /**
   * Append message to conversation
   */
  function appendMessage(role, text) {
    if (!elements.conversation) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `msg-${role}`;
    messageDiv.style.cssText = `
      margin: 0.75rem 0;
      padding: 0.75rem 1rem;
      border-radius: 1rem;
      max-width: 85%;
      word-wrap: break-word;
      animation: slideIn 0.3s ease-out;
      ${role === 'user' ? `
        background: linear-gradient(135deg, #14B8A6, #0891b2);
        color: white;
        margin-left: auto;
        border-bottom-right-radius: 0.25rem;
      ` : `
        background: #F3F4F6;
        color: #111827;
        margin-right: auto;
        border-bottom-left-radius: 0.25rem;
      `}
    `;

    const label = document.createElement('div');
    label.style.cssText = 'font-size: 0.75rem; font-weight: 600; margin-bottom: 0.25rem; opacity: 0.8;';
    label.textContent = role === 'user' ? 'You' : 'Tony\'s AI Assistant';

    const content = document.createElement('div');
    content.style.cssText = 'font-size: 0.875rem; line-height: 1.5;';
    content.textContent = text;

    messageDiv.appendChild(label);
    messageDiv.appendChild(content);
    elements.conversation.appendChild(messageDiv);

    // Scroll to bottom
    elements.conversation.scrollTop = elements.conversation.scrollHeight;
  }

  /**
   * Type message with animation
   */
  async function typeMessage(role, text) {
    if (!elements.conversation) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `msg-${role}`;
    messageDiv.style.cssText = `
      margin: 0.75rem 0;
      padding: 0.75rem 1rem;
      border-radius: 1rem;
      max-width: 85%;
      word-wrap: break-word;
      background: #F3F4F6;
      color: #111827;
      margin-right: auto;
      border-bottom-left-radius: 0.25rem;
      animation: slideIn 0.3s ease-out;
    `;

    const label = document.createElement('div');
    label.style.cssText = 'font-size: 0.75rem; font-weight: 600; margin-bottom: 0.25rem; opacity: 0.8;';
    label.textContent = 'Tony\'s AI Assistant';

    const content = document.createElement('div');
    content.style.cssText = 'font-size: 0.875rem; line-height: 1.5;';

    messageDiv.appendChild(label);
    messageDiv.appendChild(content);
    elements.conversation.appendChild(messageDiv);

    // Type effect
    for (let i = 0; i < text.length; i++) {
      content.textContent += text[i];
      elements.conversation.scrollTop = elements.conversation.scrollHeight;
      await new Promise(resolve => setTimeout(resolve, CONFIG.typingDelay));
    }
  }

  /**
   * Create typing indicator
   */
  function createTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.style.cssText = `
      display: none;
      margin: 0.75rem 0;
      padding: 0.75rem 1rem;
      border-radius: 1rem;
      max-width: 85%;
      background: #F3F4F6;
      margin-right: auto;
    `;

    const dots = document.createElement('div');
    dots.style.cssText = 'display: flex; gap: 0.25rem;';

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6B7280;
        animation: bounce 1.4s infinite ease-in-out;
        animation-delay: ${i * 0.16}s;
      `;
      dots.appendChild(dot);
    }

    indicator.appendChild(dots);
    return indicator;
  }

  /**
   * Show/hide typing indicator
   */
  function showTyping(show) {
    state.isTyping = show;
    if (elements.typingIndicator) {
      elements.typingIndicator.style.display = show ? 'block' : 'none';
      if (show && elements.conversation) {
        elements.conversation.scrollTop = elements.conversation.scrollHeight;
      }
    }
  }

  /**
   * Handle key press
   */
  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  /**
   * Add navbar scroll effect
   */
  function addNavbarScrollEffect() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  /**
   * Add CSS animations
   */
  function addAnimations() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes bounce {
        0%, 80%, 100% {
          transform: scale(0);
        }
        40% {
          transform: scale(1);
        }
      }

      .has-notification::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        background: #EF4444;
        border-radius: 50%;
        border: 2px solid white;
        animation: pulse 2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      addAnimations();
      initChat();
    });
  } else {
    addAnimations();
    initChat();
  }

  // Export for external configuration
  window.TonyChatWidget = {
    setApiEndpoint: (url) => { CONFIG.apiEndpoint = url; },
    toggleChat: toggleChat,
    sendMessage: (msg) => {
      if (elements.input) {
        elements.input.value = msg;
        handleSendMessage();
      }
    }
  };

})();
