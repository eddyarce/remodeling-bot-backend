// Enhanced metadata extraction - MERGES with existing data instead of replacing
function extractSimpleMetadata(currentMessage, conversationHistory) {
  // Start with existing metadata from the most recent conversation record
  let metadata = {};
  
  // Get existing metadata from conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    const lastRecord = conversationHistory[conversationHistory.length - 1];
    if (lastRecord.metadata) {
      try {
        const existingMeta = JSON.parse(lastRecord.metadata);
        metadata = { ...existingMeta }; // Copy existing metadata
        console.log('Starting with existing metadata:', metadata);
      } catch (e) {
        console.error('Error parsing existing metadata:', e);
        metadata = {};
      }
    }
  }
  
  // Combine all user messages
  const allMessages = conversationHistory
    .filter(msg => msg.role === 'user')
    .map(msg => msg.message)
    .concat([currentMessage])
    .join(' ');

  console.log('Analyzing text for new metadata in:', currentMessage);

  // Extract email (only if we don't have one)
  if (!metadata.email) {
    const emailMatch = allMessages.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      metadata.email = emailMatch[0];
      console.log('Found NEW email:', metadata.email);
    }
  }

  // Extract phone (only if we don't have one)
  if (!metadata.phone) {
    const phoneMatch = allMessages.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    if (phoneMatch) {
      metadata.phone = phoneMatch[0];
      console.log('Found NEW phone:', metadata.phone);
    }
  }

  // Extract budget (only if we don't have one)
  if (!metadata.budget) {
    const budgetMatch = allMessages.match(/\$(\d+)k|\$(\d+),?(\d+)?/i);
    if (budgetMatch) {
      let budget = 0;
      if (budgetMatch[1]) { // $100k format
        budget = parseInt(budgetMatch[1]) * 1000;
      } else if (budgetMatch[2]) { // $100,000 format
        budget = parseInt(budgetMatch[2] + (budgetMatch[3] || ''));
      }
      if (budget > 1000) {
        metadata.budget = budget;
        console.log('Found NEW budget:', metadata.budget);
      }
    }
  }

  // Extract timeline (only if we don't have one)
  if (!metadata.timeline_months) {
    const timelineMatch = allMessages.match(/(\d+)\s*months?/i);
    if (timelineMatch) {
      metadata.timeline_months = parseInt(timelineMatch[1]);
      console.log('Found NEW timeline:', metadata.timeline_months);
    }
  }

  // Extract ZIP code (only if we don't have one)
  if (!metadata.zip_code) {
    const zipMatch = allMessages.match(/\b(\d{5})\b/);
    if (zipMatch) {
      metadata.zip_code = zipMatch[1];
      console.log('Found NEW zip:', metadata.zip_code);
    }
  }

  // Extract project type (only if we don't have one)
  if (!metadata.project_type) {
    const projectTypes = ['kitchen', 'bathroom', 'bedroom', 'living room', 'basement', 'addition'];
    for (const type of projectTypes) {
      if (allMessages.toLowerCase().includes(type)) {
        metadata.project_type = type;
        console.log('Found NEW project type:', metadata.project_type);
        break;
      }
    }
  }

  // Extract name (only if we don't have one) - focus on current message for names
  if (!metadata.name) {
    const namePatterns = [
      /my name is ([A-Za-z]+ [A-Za-z]+)/i,
      /i'm ([A-Za-z]+ [A-Za-z]+)/i,
      /I am ([A-Za-z]+ [A-Za-z]+)/i,
      /^([A-Za-z]+ [A-Za-z]+)$/i  // Just a name by itself
    ];
    
    for (const pattern of namePatterns) {
      // Check current message first, then all messages
      const nameMatch = currentMessage.match(pattern) || allMessages.match(pattern);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        // Validate it's not a common word
        const commonWords = ['yes', 'yeah', 'sure', 'okay', 'ok', 'good', 'great', 'fine', 'hello', 'hi'];
        if (!commonWords.includes(name.toLowerCase()) && name.length > 3 && name.includes(' ')) {
          metadata.name = name;
          console.log('Found NEW name:', metadata.name);
          break;
        }
      }
    }
  }

  console.log('Final MERGED metadata:', metadata);
  return metadata;
}