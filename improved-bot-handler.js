const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'missing-key'
});

// Simplified improved bot handler - more reliable
async function handleImprovedBotMessage(req, res) {
  const { message, conversation_id } = req.body;
  const customerId = req.params.customerId;

  console.log('=== IMPROVED BOT START ===');
  console.log('Message:', message);
  console.log('Conversation ID:', conversation_id);
  console.log('Customer ID:', customerId);

  try {
    // 1. Fetch customer data with error handling
    let customer = null;
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();
      
      if (error) {
        console.error('Customer fetch error:', error);
      } else {
        customer = data;
        console.log('Customer found:', customer?.company_name);
      }
    } catch (customerError) {
      console.error('Customer query failed:', customerError);
    }
    
    const companyName = customer?.company_name || 'Elite Remodeling';
    const serviceAreas = customer?.service_areas || '90210';
    const minBudget = customer?.minimum_budget || 75000;
    const maxTimeline = customer?.timeline_threshold || 12;

    console.log('Using company data:', { companyName, minBudget, maxTimeline, serviceAreas });

    // 2. Get conversation history with error handling
    let conversationHistory = [];
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('History fetch error:', error);
      } else {
        conversationHistory = data || [];
        console.log('Found', conversationHistory.length, 'previous messages');
      }
    } catch (historyError) {
      console.error('History query failed:', historyError);
    }

    // 3. Extract metadata from all messages (simple extraction)
    const currentMetadata = extractSimpleMetadata(message, conversationHistory);
    console.log('Extracted metadata:', currentMetadata);

    // 4. Generate Mason response (simplified)
    let masonResponse;
    try {
      masonResponse = await generateSimpleMasonResponse(
        message, 
        currentMetadata,
        companyName,
        minBudget,
        maxTimeline,
        serviceAreas
      );
      console.log('Mason response generated:', masonResponse);
    } catch (masonError) {
      console.error('Mason response error:', masonError);
      masonResponse = `Hi! I'm Mason from ${companyName}. How can I help you with your remodeling project?`;
    }

    // 5. Simple validation
    const leadStatus = determineSimpleStatus(currentMetadata, minBudget, maxTimeline, serviceAreas);
    const isQualified = leadStatus === 'qualified';
    
    console.log('Lead status:', leadStatus, 'Qualified:', isQualified);

    // 6. Save messages with error handling (prevent duplicates)
    try {
      // Check if this exact message already exists to prevent duplicates
      const { data: existingMessage, error: checkError } = await supabase
        .from('conversations')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('role', 'user')
        .eq('message', message)
        .maybeSingle();

      if (!existingMessage) {
        // Save user message only if it doesn't exist
        await supabase
          .from('conversations')
          .insert({
            conversation_id,
            customer_id: customerId,
            role: 'user',
            message,
            metadata: JSON.stringify(currentMetadata),
            lead_status: leadStatus,
            is_qualified: isQualified
          });
          
        console.log('User message saved');
      } else {
        console.log('User message already exists, skipping save');
      }

      // Always save assistant response (each should be unique)
      await supabase
        .from('conversations')
        .insert({
          conversation_id,
          customer_id: customerId,
          role: 'assistant',
          message: masonResponse,
          metadata: JSON.stringify(currentMetadata),
          lead_status: leadStatus,
          is_qualified: isQualified
        });
        
      console.log('Assistant message saved');
    } catch (saveError) {
      console.error('Save error:', saveError);
      // Continue anyway - don't crash
    }

    console.log('=== IMPROVED BOT SUCCESS ===');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ response: masonResponse }));

  } catch (error) {
    console.error('=== IMPROVED BOT ERROR ===');
    console.error('Full error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Improved bot processing failed', 
      details: error.message 
    }));
  }
}

// Simple metadata extraction
function extractSimpleMetadata(currentMessage, conversationHistory) {
  const metadata = {};
  
  // Combine all user messages
  const allMessages = conversationHistory
    .filter(msg => msg.role === 'user')
    .map(msg => msg.message)
    .concat([currentMessage])
    .join(' ');

  console.log('Analyzing text for metadata:', allMessages);

  // Extract email
  const emailMatch = allMessages.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    metadata.email = emailMatch[0];
    console.log('Found email:', metadata.email);
  }

  // Extract phone
  const phoneMatch = allMessages.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  if (phoneMatch) {
    metadata.phone = phoneMatch[0];
    console.log('Found phone:', metadata.phone);
  }

  // Extract budget
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
      console.log('Found budget:', metadata.budget);
    }
  }

  // Extract timeline
  const timelineMatch = allMessages.match(/(\d+)\s*months?/i);
  if (timelineMatch) {
    metadata.timeline_months = parseInt(timelineMatch[1]);
    console.log('Found timeline:', metadata.timeline_months);
  }

  // Extract ZIP code
  const zipMatch = allMessages.match(/\b(\d{5})\b/);
  if (zipMatch) {
    metadata.zip_code = zipMatch[1];
    console.log('Found zip:', metadata.zip_code);
  }

  // Extract project type
  const projectTypes = ['kitchen', 'bathroom', 'bedroom', 'living room', 'basement', 'addition'];
  for (const type of projectTypes) {
    if (allMessages.toLowerCase().includes(type)) {
      metadata.project_type = type;
      console.log('Found project type:', metadata.project_type);
      break;
    }
  }

  // Extract name (improved patterns)
  const namePatterns = [
    /my name is ([A-Za-z]+ [A-Za-z]+)/i,
    /i'm ([A-Za-z]+ [A-Za-z]+)/i,
    /I am ([A-Za-z]+ [A-Za-z]+)/i,
    /^([A-Za-z]+ [A-Za-z]+)$/i  // Just a name by itself
  ];
  
  for (const pattern of namePatterns) {
    const nameMatch = currentMessage.match(pattern) || allMessages.match(pattern);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      // Validate it's not a common word
      const commonWords = ['yes', 'yeah', 'sure', 'okay', 'ok', 'good', 'great', 'fine', 'hello', 'hi'];
      if (!commonWords.includes(name.toLowerCase()) && name.length > 3 && name.includes(' ')) {
        metadata.name = name;
        console.log('Found name:', metadata.name);
        break;
      }
    }
  }

  return metadata;
}

// Simple status determination
function determineSimpleStatus(metadata, minBudget, maxTimeline, serviceAreas) {
  const hasProject = !!metadata.project_type;
  const hasLocation = !!metadata.zip_code;
  const hasBudget = !!metadata.budget;
  const hasTimeline = !!metadata.timeline_months;
  const hasName = !!metadata.name;
  const hasEmail = !!metadata.email;
  const hasPhone = !!metadata.phone;

  // Check disqualification
  if (hasLocation && !metadata.zip_code.startsWith(serviceAreas.split(',')[0].trim())) {
    return 'disqualified';
  }
  if (hasBudget && metadata.budget < minBudget) {
    return 'disqualified';
  }
  if (hasTimeline && metadata.timeline_months > maxTimeline) {
    return 'disqualified';
  }

  // Check qualification
  if (hasProject && hasLocation && hasBudget && hasTimeline && hasName && hasEmail && hasPhone) {
    return 'qualified';
  }

  return 'in_progress';
}

// Simple Mason response generation
async function generateSimpleMasonResponse(message, metadata, companyName, minBudget, maxTimeline, serviceAreas) {
  const lowerMessage = message.toLowerCase();

  // Handle company questions
  if (lowerMessage.includes('what company') || lowerMessage.includes('which company')) {
    return `This is ${companyName}, where we specialize in high-quality, personalized remodeling projects. How can we assist you with your remodeling needs?`;
  }

  // Handle greetings
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return `Hello! How can I assist you with your remodeling needs today?`;
  }

  // Check what info we have and what we need
  const hasProject = !!metadata.project_type;
  const hasLocation = !!metadata.zip_code;
  const hasBudget = !!metadata.budget;
  const hasTimeline = !!metadata.timeline_months;
  const hasName = !!metadata.name;
  const hasEmail = !!metadata.email;
  const hasPhone = !!metadata.phone;

  console.log('Metadata status:', { hasProject, hasLocation, hasBudget, hasTimeline, hasName, hasEmail, hasPhone });

  // If they provided comprehensive info at once
  if (hasProject && hasLocation && hasBudget && hasTimeline) {
    const qualifies = metadata.budget >= minBudget && 
                     metadata.timeline_months <= maxTimeline &&
                     metadata.zip_code.startsWith(serviceAreas.split(',')[0].trim());
    
    if (qualifies) {
      if (!hasName) {
        return `Excellent! A ${metadata.project_type} remodel in ${metadata.zip_code} with a $${(metadata.budget/1000).toFixed(0)}k budget and ${metadata.timeline_months}-month timeline sounds perfect. We can definitely help you with that! What's your full name?`;
      } else if (!hasEmail) {
        return `Perfect, ${metadata.name}! What's the best email address to reach you?`;
      } else if (!hasPhone) {
        return `Great! And what's your phone number?`;
      } else {
        return `Wonderful! We have all your information. Our design team will reach out within 24 hours to discuss your ${metadata.project_type} project. Thank you!`;
      }
    } else {
      // Handle disqualification
      if (metadata.budget < minBudget) {
        return `Thank you for your interest in ${companyName}! While your ${metadata.project_type} project sounds wonderful, our minimum budget requirement is $${(minBudget/1000).toFixed(0)}k. I'd be happy to recommend some excellent contractors who work with projects in your budget range.`;
      }
      if (metadata.timeline_months > maxTimeline) {
        return `Thank you for reaching out! Your ${metadata.project_type} project sounds great, but your ${metadata.timeline_months}-month timeline is outside our current scheduling capacity. We typically work with projects starting within ${maxTimeline} months. Would you like to join our newsletter for future availability?`;
      }
    }
  }

  // Progressive questioning
  if (!hasProject) {
    return `Hi! I'm Mason from ${companyName}. I'd love to hear about your remodeling project. What type of project are you thinking about?`;
  }
  if (!hasLocation) {
    return `Great! A ${metadata.project_type} remodel sounds exciting. What's your zip code so I can make sure we service your area?`;
  }
  if (!hasBudget) {
    return `Perfect! To ensure we're the right fit, what's your approximate budget for this ${metadata.project_type} project? We typically work with projects starting at $${(minBudget/1000).toFixed(0)}k.`;
  }
  if (!hasTimeline) {
    return `Excellent! When are you hoping to complete this ${metadata.project_type} project?`;
  }

  // After qualification, get contact info
  if (!hasName) {
    return `Based on what you've shared, I'd love to connect you with our design team! What's your full name?`;
  }
  if (!hasEmail) {
    return `Great! What's the best email address to reach you?`;
  }
  if (!hasPhone) {
    return `Perfect! And what's your phone number?`;
  }

  // Fallback
  return `Thank you for that information! Is there anything else about your ${metadata.project_type || 'remodeling'} project you'd like to discuss?`;
}

module.exports = { handleImprovedBotMessage };