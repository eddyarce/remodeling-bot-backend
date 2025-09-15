const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'missing-key'
});

// Main improved bot handler with two-agent system
async function handleImprovedBotMessage(req, res) {
  const { message, conversation_id } = req.body;
  const customerId = req.params.customerId;

  console.log('Processing message for conversation:', conversation_id);
  console.log('Customer ID:', customerId);

  try {
    // 1. Fetch customer data
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle();
    
    if (customerError) {
      console.error('Error fetching customer:', customerError);
    }
    
    console.log('Customer data:', customer);
    
    const companyName = customer?.company_name || 'Elite Remodeling';
    const serviceAreas = customer?.service_areas || '90210';
    const minBudget = customer?.minimum_budget || 75000;
    const maxTimeline = customer?.timeline_threshold || 12;

    // 2. Get conversation history
    const { data: conversationHistory, error: historyError } = await supabase
      .from('conversations')
      .select('*')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('Error fetching conversation:', historyError);
    }

    // 3. Build conversation context
    const previousMessages = conversationHistory || [];
    const conversationText = previousMessages
      .map(msg => `${msg.role}: ${msg.message}`)
      .join('\n');

    // 4. Extract current metadata from conversation
    const currentMetadata = extractMetadataFromConversation(previousMessages.concat([
      { role: 'user', message: message }
    ]));

    console.log('Current metadata:', currentMetadata);

    // 5. MASON: Generate conversational response
    const masonResponse = await generateMasonResponse(
      message, 
      conversationText, 
      currentMetadata,
      companyName,
      minBudget,
      maxTimeline,
      serviceAreas
    );

    console.log('Mason response:', masonResponse);

    // 6. VALIDATOR: Check if conversation is complete and qualified
    const validationResult = await validateConversation(
      conversationText + `\nuser: ${message}\nassistant: ${masonResponse}`,
      currentMetadata,
      minBudget,
      maxTimeline,
      serviceAreas
    );

    console.log('Validation result:', validationResult);

    // 7. Save user message
    await supabase
      .from('conversations')
      .insert({
        conversation_id,
        customer_id: customerId,
        role: 'user',
        message,
        metadata: JSON.stringify(currentMetadata),
        lead_status: validationResult.status,
        is_qualified: validationResult.status === 'qualified',
        session_data: JSON.stringify({ validation: validationResult })
      });

    // 8. Save assistant response  
    await supabase
      .from('conversations')
      .insert({
        conversation_id,
        customer_id: customerId,
        role: 'assistant',
        message: masonResponse,
        metadata: JSON.stringify(currentMetadata),
        lead_status: validationResult.status,
        is_qualified: validationResult.status === 'qualified',
        session_data: JSON.stringify({ validation: validationResult })
      });

    // 9. If qualified, trigger email notification
    if (validationResult.status === 'qualified' && validationResult.hasAllContactInfo) {
      try {
        console.log('Triggering email notification for qualified lead');
        // Call the internal email notification function instead of HTTP request
        // We'll handle this in the main backend for now
        console.log('Lead qualified - email notification would be sent here');
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ response: masonResponse }));

  } catch (error) {
    console.error('Improved bot error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process message' }));
  }
}

// MASON: Conversational AI Agent
async function generateMasonResponse(message, conversationHistory, metadata, companyName, minBudget, maxTimeline, serviceAreas) {
  // Fallback if no OpenAI
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'missing-key') {
    console.log('Using fallback Mason response - no OpenAI key');
    return generateSimpleMasonResponse(message, metadata, companyName, minBudget);
  }

  try {
    const systemPrompt = `You are Mason, a friendly remodeling specialist for ${companyName}.

COMPANY INFO:
- Company: ${companyName}
- Service Areas: ${serviceAreas}
- Minimum Budget: $${minBudget.toLocaleString()}
- Timeline: Projects within ${maxTimeline} months

YOUR ROLE: Have natural, helpful conversations. Build rapport. Don't worry about qualification logic - just be conversational.

QUALIFICATION SEQUENCE (ask only what's missing):
1. PROJECT TYPE: What remodeling project are they considering?
2. LOCATION: What's their zip code?
3. BUDGET: What's their budget range?
4. TIMELINE: When do they want to complete the project?

CONTACT INFO (only ask after they qualify):
5. NAME: Full name
6. EMAIL: Best email address  
7. PHONE: Phone number

GUIDELINES:
- Be warm and professional
- Ask ONE question at a time
- Don't ask about home age unless directly relevant
- If they provide multiple pieces of info, acknowledge all of it
- Don't repeat questions if info already provided
- For timeline: anything ${maxTimeline} months or LESS qualifies

CURRENT INFO COLLECTED: ${JSON.stringify(metadata)}

CONVERSATION SO FAR:
${conversationHistory}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Mason AI error:', error);
    return generateSimpleMasonResponse(message, metadata, companyName, minBudget);
  }
}

// VALIDATOR: Reviews conversation and makes qualification decision
async function validateConversation(fullConversation, metadata, minBudget, maxTimeline, serviceAreas) {
  // Fallback validation logic
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'missing-key') {
    return simpleValidation(metadata, minBudget, maxTimeline, serviceAreas);
  }

  try {
    const systemPrompt = `You are a Validator AI that reviews conversations to determine lead qualification status.

QUALIFICATION REQUIREMENTS:
1. Project Type: Kitchen, bathroom, addition, whole home, etc.
2. Location: ZIP code in service area (${serviceAreas})
3. Budget: At least $${minBudget.toLocaleString()}
4. Timeline: ${maxTimeline} months or LESS (anything over disqualifies)

CONTACT INFO REQUIREMENTS (for qualified leads):
5. Name: Full name provided
6. Email: Valid email address
7. Phone: Phone number provided

INSTRUCTIONS:
- Review the ENTIRE conversation
- Determine what information has been collected
- Check if they meet qualification criteria
- Determine status: "in_progress", "qualified", or "disqualified"

OUTPUT FORMAT (JSON):
{
  "status": "in_progress|qualified|disqualified",
  "hasProjectType": true/false,
  "hasLocation": true/false,
  "hasValidLocation": true/false,
  "hasBudget": true/false,
  "meetsMinBudget": true/false,
  "hasTimeline": true/false,
  "meetsTimelineReq": true/false,
  "hasName": true/false,
  "hasEmail": true/false,
  "hasPhone": true/false,
  "hasAllContactInfo": true/false,
  "reasoning": "Brief explanation of decision"
}

CONVERSATION TO REVIEW:
${fullConversation}

CURRENT METADATA:
${JSON.stringify(metadata)}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt }
      ],
      temperature: 0.1,
      max_tokens: 300
    });

    try {
      const result = JSON.parse(completion.choices[0].message.content);
      return result;
    } catch (parseError) {
      console.error('Validator JSON parse error:', parseError);
      return simpleValidation(metadata, minBudget, maxTimeline, serviceAreas);
    }

  } catch (error) {
    console.error('Validator AI error:', error);
    return simpleValidation(metadata, minBudget, maxTimeline, serviceAreas);
  }
}

// Simple fallback validation
function simpleValidation(metadata, minBudget, maxTimeline, serviceAreas) {
  const hasProjectType = !!metadata.project_type;
  const hasLocation = !!metadata.zip_code;
  const hasValidLocation = hasLocation && metadata.zip_code.toString().startsWith(serviceAreas.split(',')[0].trim());
  const hasBudget = !!metadata.budget;
  const meetsMinBudget = hasBudget && metadata.budget >= minBudget;
  const hasTimeline = !!metadata.timeline_months;
  const meetsTimelineReq = hasTimeline && parseInt(metadata.timeline_months) <= maxTimeline;
  const hasName = !!metadata.name;
  const hasEmail = !!metadata.email;
  const hasPhone = !!metadata.phone;
  const hasAllContactInfo = hasName && hasEmail && hasPhone;

  let status = 'in_progress';
  
  // Check disqualification
  if ((hasLocation && !hasValidLocation) || 
      (hasBudget && !meetsMinBudget) || 
      (hasTimeline && !meetsTimelineReq)) {
    status = 'disqualified';
  }
  // Check qualification  
  else if (hasProjectType && hasValidLocation && meetsMinBudget && meetsTimelineReq && hasAllContactInfo) {
    status = 'qualified';
  }

  return {
    status,
    hasProjectType,
    hasLocation,
    hasValidLocation,
    hasBudget,
    meetsMinBudget,
    hasTimeline,
    meetsTimelineReq,
    hasName,
    hasEmail,
    hasPhone,
    hasAllContactInfo,
    reasoning: `Status: ${status} based on collected info`
  };
}

// Simple Mason fallback responses
function generateSimpleMasonResponse(message, metadata, companyName, minBudget) {
  const lowerMessage = message.toLowerCase();

  // Handle company questions
  if (lowerMessage.includes('what company') || lowerMessage.includes('which company')) {
    return `I work for ${companyName}. How can I help you with your remodeling project?`;
  }

  // First message - greeting
  if (!metadata.project_type) {
    return `Hi! I'm Mason from ${companyName}. I'd love to hear about your remodeling project. What type of project are you thinking about?`;
  }

  // Get location
  if (!metadata.zip_code) {
    return "Great! What's your zip code so I can make sure we service your area?";
  }

  // Get budget  
  if (!metadata.budget) {
    return `Perfect! To ensure we're the right fit, what's your approximate budget for this project? We typically work with projects starting at $${minBudget.toLocaleString()}.`;
  }

  // Get timeline
  if (!metadata.timeline_months) {
    return "Excellent! When are you hoping to complete this project?";
  }

  // Get contact info
  if (!metadata.name) {
    return "Based on what you've shared, I'd love to connect you with our design team! What's your full name?";
  }

  if (!metadata.email) {
    return "Great! What's the best email address to reach you?";
  }

  if (!metadata.phone) {
    return "Perfect! And what's your phone number?";
  }

  // All info collected
  return `Excellent! Our design team will reach out within 24 hours to discuss your ${metadata.project_type} project. Thank you!`;
}

// Enhanced metadata extraction from conversation
function extractMetadataFromConversation(messages) {
  const metadata = {};
  
  // Process messages in reverse order (latest first) to get most recent info
  const userMessages = messages
    .filter(msg => msg.role === 'user')
    .reverse();

  for (const msg of userMessages) {
    const messageText = msg.message;
    
    // Extract email (most specific first)
    if (!metadata.email) {
      const emailMatch = messageText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch) metadata.email = emailMatch[0];
    }
    
    // Extract phone (flexible patterns)
    if (!metadata.phone) {
      const phonePatterns = [
        /\b(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})\b/,  // 123-456-7890, 123.456.7890, 123 456 7890
        /\b(\d{10})\b/,  // 1234567890
        /\((\d{3})\)\s?(\d{3})[-.\s]?(\d{4})/  // (123) 456-7890
      ];
      
      for (const pattern of phonePatterns) {
        const phoneMatch = messageText.match(pattern);
        if (phoneMatch) {
          metadata.phone = phoneMatch[0];
          break;
        }
      }
    }
    
    // Extract budget (various formats)
    if (!metadata.budget) {
      const budgetPatterns = [
        /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,  // $75,000, $75000.00
        /(\d{1,3}(?:,\d{3})*)\s*(?:dollars?|k|thousand)/gi  // 75000 dollars, 75k
      ];
      
      for (const pattern of budgetPatterns) {
        const budgetMatch = messageText.match(pattern);
        if (budgetMatch) {
          let budget = budgetMatch[1].replace(/,/g, '');
          if (messageText.toLowerCase().includes('k') || messageText.toLowerCase().includes('thousand')) {
            budget = parseInt(budget) * 1000;
          } else {
            budget = parseInt(budget);
          }
          if (budget > 1000) { // Reasonable budget threshold
            metadata.budget = budget;
            break;
          }
        }
      }
    }
    
    // Extract timeline  
    if (!metadata.timeline_months) {
      const timelinePatterns = [
        /(\d+)\s*months?/i,
        /(\d+)\s*weeks?/i,  // Convert weeks to months
        /(\d+)\s*years?/i   // Convert years to months
      ];
      
      for (const pattern of timelinePatterns) {
        const timelineMatch = messageText.match(pattern);
        if (timelineMatch) {
          let months = parseInt(timelineMatch[1]);
          if (messageText.toLowerCase().includes('week')) {
            months = Math.ceil(months / 4); // Convert weeks to months
          } else if (messageText.toLowerCase().includes('year')) {
            months = months * 12; // Convert years to months
          }
          metadata.timeline_months = months;
          break;
        }
      }
    }
    
    // Extract ZIP code
    if (!metadata.zip_code) {
      const zipMatch = messageText.match(/\b(\d{5})\b/);
      if (zipMatch) metadata.zip_code = zipMatch[1];
    }
    
    // Extract name (context-aware)
    if (!metadata.name) {
      const namePatterns = [
        /my name is ([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
        /i'm ([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
        /I am ([A-Za-z]+(?:\s+[A-Za-z]+)*)/i
      ];
      
      for (const pattern of namePatterns) {
        const nameMatch = messageText.match(pattern);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          // Validate it's not a common word
          const commonWords = ['yes', 'yeah', 'sure', 'okay', 'ok', 'good', 'great', 'fine'];
          if (!commonWords.includes(name.toLowerCase()) && name.length > 1) {
            metadata.name = name;
            break;
          }
        }
      }
    }
    
    // Extract project type
    if (!metadata.project_type) {
      const projectKeywords = [
        'kitchen', 'bathroom', 'bath', 'bedroom', 'living room', 'basement', 
        'addition', 'extension', 'whole house', 'full remodel', 'renovation',
        'master suite', 'family room', 'dining room', 'office', 'den'
      ];
      
      for (const keyword of projectKeywords) {
        if (messageText.toLowerCase().includes(keyword)) {
          metadata.project_type = keyword;
          break;
        }
      }
    }
  }
  
  return metadata;
}

module.exports = { handleImprovedBotMessage };