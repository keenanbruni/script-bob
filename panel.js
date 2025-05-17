// Main JavaScript for the ScriptBob panel

// DOM Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const saveSettingsBtn = document.getElementById('save-settings');
const apiProvider = document.getElementById('api-provider');
const apiKey = document.getElementById('api-key');
const apiEndpoint = document.getElementById('api-endpoint');
const modelInput = document.getElementById('model');
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-btn');

// State
let settings = {
  provider: 'openai',
  apiKey: '',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4'
};

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get(['llmSettings'], (result) => {
    if (result.llmSettings) {
      settings = result.llmSettings;
      apiProvider.value = settings.provider;
      apiKey.value = settings.apiKey;
      apiEndpoint.value = settings.endpoint;
      modelInput.value = settings.model;
    }
  });
}

// Save settings to storage
function saveSettings() {
  settings = {
    provider: apiProvider.value,
    apiKey: apiKey.value,
    endpoint: apiEndpoint.value,
    model: modelInput.value
  };
  
  chrome.storage.sync.set({ llmSettings: settings }, () => {
    addMessage('Settings saved successfully!', 'bot');
    toggleSettings();
  });
}

// Toggle settings panel
function toggleSettings() {
  settingsPanel.classList.toggle('hidden');
}

// Add a message to the chat
function addMessage(text, sender) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message');
  messageDiv.classList.add(sender === 'user' ? 'user-message' : 'bot-message');
  messageDiv.textContent = text;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Execute HTML modification in the inspected page
function executeInPage(code) {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(code, (result, isException) => {
      if (isException) {
        resolve({ error: true, message: 'Error executing code in page' });
      } else {
        resolve({ error: false, result });
      }
    });
  });
}

// Get HTML of the current page
async function getPageHTML() {
  const result = await executeInPage(`document.documentElement.outerHTML`);
  return result.error ? '' : result.result;
}

// Send user message to LLM
async function sendToLLM(query, html) {
  if (!settings.apiKey) {
    addMessage('Please configure your API settings first.', 'bot');
    toggleSettings();
    return null;
  }

  // Create a prompt for the LLM that includes the user's query and relevant context
  const prompt = `You are a helpful assistant that can modify HTML based on natural language requests. 
The current HTML document is:
\`\`\`html
${html}
\`\`\`

The user wants to: "${query}"

Analyze the HTML and provide JavaScript code that will make the requested changes.
Your response should be valid JavaScript that can be executed in the browser console to modify the DOM.
Use document.querySelector and similar DOM APIs to select and modify elements.
DO NOT include explanations, just return the JavaScript code to execute.`;

  try {
    let response;
    
    if (settings.provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: 'You are a helpful web development assistant that writes JavaScript to modify HTML.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        })
      });
    } else if (settings.provider === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })
      });
    } else {
      // Custom provider
      response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: 'You are a helpful web development assistant that writes JavaScript to modify HTML.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        })
      });
    }

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the code from the response
    let code;
    if (settings.provider === 'openai') {
      code = data.choices[0].message.content;
    } else if (settings.provider === 'anthropic') {
      code = data.content[0].text;
    } else {
      // Try to handle custom provider response generically
      code = data.choices ? data.choices[0].message.content : 
             data.content ? data.content[0].text : 
             JSON.stringify(data);
    }
    
    // Clean up the code - remove markdown code blocks if present
    code = code.replace(/```javascript|```js|```/g, '').trim();
    
    return code;
  } catch (error) {
    console.error('Error calling LLM API:', error);
    addMessage(`Error: ${error.message}`, 'bot');
    return null;
  }
}

// Handle user message
async function handleUserMessage() {
  const message = userInput.value.trim();
  if (!message) return;
  
  // Clear input
  userInput.value = '';
  
  // Add user message to chat
  addMessage(message, 'user');
  
  // Get current page HTML
  addMessage('Analyzing page...', 'bot');
  const html = await getPageHTML();
  
  if (!html) {
    addMessage('Failed to get page HTML. Make sure you are on a valid webpage.', 'bot');
    return;
  }
  
  // Get LLM response
  addMessage('Generating solution...', 'bot');
  const code = await sendToLLM(message, html);
  
  if (!code) return;
  
  // Show the code to the user
  addMessage('Solution generated. Here is the code that will be executed:', 'bot');
  const codeMessage = document.createElement('div');
  codeMessage.classList.add('message', 'bot-message', 'code-message');
  
  const pre = document.createElement('pre');
  pre.textContent = code;
  codeMessage.appendChild(pre);
  
  const executeBtn = document.createElement('button');
  executeBtn.textContent = 'Execute Code';
  executeBtn.classList.add('execute-btn');
  executeBtn.onclick = async () => {
    const result = await executeInPage(code);
    if (result.error) {
      addMessage(`Error executing code: ${result.message}`, 'bot');
    } else {
      addMessage('Code executed successfully!', 'bot');
    }
  };
  
  codeMessage.appendChild(executeBtn);
  messagesContainer.appendChild(codeMessage);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Event Listeners
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  // Add welcome message
  addMessage('Welcome to ScriptBob! I can help you edit the HTML of this page using natural language commands. Please type your request below.', 'bot');
});

settingsBtn.addEventListener('click', toggleSettings);
saveSettingsBtn.addEventListener('click', saveSettings);

sendButton.addEventListener('click', handleUserMessage);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleUserMessage();
  }
});

// Update endpoint based on provider selection
apiProvider.addEventListener('change', () => {
  switch(apiProvider.value) {
    case 'openai':
      apiEndpoint.value = 'https://api.openai.com/v1/chat/completions';
      modelInput.value = 'gpt-4';
      break;
    case 'anthropic':
      apiEndpoint.value = 'https://api.anthropic.com/v1/messages';
      modelInput.value = 'claude-2';
      break;
    case 'custom':
      apiEndpoint.value = '';
      modelInput.value = '';
      break;
  }
});