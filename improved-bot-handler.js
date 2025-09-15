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
      console.log('Looking up customer with ID:', customerId);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();
      
      if (error) {
        console.error('Customer fetch error:', error);
      } else {
        customer = data;
        console.log('Customer found:', customer?.company_name || 'NO CUSTOMER FOUND');
        console.log('Customer contact_email:', customer?.contact_email || 'NO EMAIL');
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

    // 3. Extract and preserve metadata properly
    let currentMetadata = {};
    
    // Get existing metadata from the most recent conversation record
    if (conversationHistory && conversationHistory.length > 0) {
      const lastRecord = conversationHistory[conversationHistory.length - 1];
      if (lastRecord.metadata) {
        try {
          currentMetadata = JSON.parse(lastRecord.metadata);
          console.log('Starting with existing metadata:', currentMetadata);
        } catch (e) {
          console.error('Error parsing existing metadata:', e);
          currentMetadata = {};
        }
      }
    }
    
    // Extract only NEW information from current message (don't reprocess everything)
    const newMetadata = extractNewMetadataOnly(message, currentMetadata);
    
    // Merge new data with existing
    currentMetadata = { ...currentMetadata, ...newMetadata };
    console.log('Final metadata after merge:', currentMetadata);

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

    // 6. Check if newly qualified and trigger email notification
    const wasAlreadyQualified = conversationHistory.some(record => 
      record.is_qualified === true || record.lead_status === 'qualified'
    );
    
    if (isQualified && !wasAlreadyQualified) {
      console.log('🎉 NEW QUALIFIED LEAD DETECTED - Triggering email notification!');
      console.log('Customer data for email:', customer);
      console.log('Lead data for email:', currentMetadata);
      
      // Import email service and send notification
      try {
        if (!customer) {
          console.error('❌ Cannot send email - customer data is null');
          console.log('Customer ID that failed:', customerId);
        } else if (!customer.contact_email) {
          console.error('❌ Cannot send email - customer has no contact_email');
          console.log('Customer data:', customer);
        } else {
          const { sendQualifiedLeadEmail } = require('./services/emailService.js');
          
          const leadData = {
            conversation_id,
            metadata: currentMetadata,
            lead_status: leadStatus,
            customer_id: customerId,
            created_at: new Date().toISOString()
          };
          
          await sendQualifiedLeadEmail(leadData, customer);
          console.log('✅ Email notification sent successfully');
        }
      } catch (emailError) {
        console.error('❌ Email notification failed:', emailError);
        console.error('Full error stack:', emailError.stack);
        // Don't crash the bot if email fails
      }
    } else if (isQualified && wasAlreadyQualified) {
      console.log('Lead already qualified - no duplicate email sent');
    }

    // 7. Save/update conversation record (one record per conversation, not per message)
    try {
      // Look for existing conversation record
      const { data: existingConversation, error: fetchError } = await supabase
        .from('conversations')
        .select('*')
        .eq('conversation_id', conversation_id)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingConversation) {
        // Update existing conversation with latest info
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            message: `${existingConversation.message}\n\nUser: ${message}\nAssistant: ${masonResponse}`,
            metadata: JSON.stringify(currentMetadata),
            lead_status: leadStatus,
            is_qualified: isQualified
          })
          .eq('id', existingConversation.id);
          
        if (updateError) {
          console.error('Update error:', updateError);
        } else {
          console.log('Conversation updated successfully');
        }
      } else {
        // Create new conversation record
        const { error: insertError } = await supabase
          .from('conversations')
          .insert({
            conversation_id,
            customer_id: customerId,
            role: 'assistant', // Use assistant since we're storing the full conversation
            message: `User: ${message}\nAssistant: ${masonResponse}`,
            metadata: JSON.stringify(currentMetadata),
            lead_status: leadStatus,
            is_qualified: isQualified
          });
          
        if (insertError) {
          console.error('Insert error:', insertError);
        } else {
          console.log('New conversation created successfully');
        }
      }
    } catch (saveError) {
      console.error('Save/update error:', saveError);
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

// Extract only NEW metadata from current message (doesn't reprocess existing data)
function extractNewMetadataOnly(currentMessage, existingMetadata) {
  const newMetadata = {};
  const msg = currentMessage.toLowerCase();
  
  console.log('Extracting NEW data from message:', currentMessage);
  console.log('Existing data to preserve:', existingMetadata);

  // Extract email (only if we don't have one)
  if (!existingMetadata.email) {
    const emailMatch = currentMessage.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      newMetadata.email = emailMatch[0];
      console.log('Found NEW email:', newMetadata.email);
    }
  }

  // Extract phone (only if we don't have one)
  if (!existingMetadata.phone) {
    const phonePattern = /\b\d{3}[-.\ ]?\d{3}[-.\ ]?\d{4}\b/;
    const phoneMatch = currentMessage.match(phonePattern);
    if (phoneMatch) {
      newMetadata.phone = phoneMatch[0];
      console.log('Found NEW phone:', newMetadata.phone);
    }
  }

  // Extract budget (only if we don't have one)
  if (!existingMetadata.budget) {
    const budgetPatterns = [
      /\$(\d+)k/i,           // $100k
      /\$(\d+),?(\d+)/i,     // $100,000 or $100000
      /(\d+)k/i              // 100k
    ];
    
    for (const pattern of budgetPatterns) {
      const budgetMatch = currentMessage.match(pattern);
      if (budgetMatch) {
        let budget = 0;
        if (pattern.source.includes('k')) {
          budget = parseInt(budgetMatch[1]) * 1000;
        } else {
          budget = parseInt(budgetMatch[1] + (budgetMatch[2] || ''));
        }
        if (budget > 5000) { // Reasonable minimum
          newMetadata.budget = budget;
          console.log('Found NEW budget:', newMetadata.budget);
          break;
        }
      }
    }
  }

  // Extract timeline (only if we don't have one)
  if (!existingMetadata.timeline_months) {
    const timelineMatch = currentMessage.match(/(\d+)\s*months?/i);
    if (timelineMatch) {
      newMetadata.timeline_months = parseInt(timelineMatch[1]);
      console.log('Found NEW timeline:', newMetadata.timeline_months);
    }
  }

  // Extract ZIP code (only if we don't have one)
  if (!existingMetadata.zip_code) {
    const zipMatch = currentMessage.match(/\b(\d{5})\b/);
    if (zipMatch) {
      newMetadata.zip_code = zipMatch[1];
      console.log('Found NEW zip code:', newMetadata.zip_code);
    }
  }

  // Extract project type (only if we don't have one)
  if (!existingMetadata.project_type) {
    const projectTypes = [
      { keywords: ['kitchen'], type: 'kitchen' },
      { keywords: ['bathroom', 'bath'], type: 'bathroom' },
      { keywords: ['bedroom'], type: 'bedroom' },
      { keywords: ['living room', 'family room'], type: 'living room' },
      { keywords: ['basement'], type: 'basement' },
      { keywords: ['addition', 'extension'], type: 'addition' }
    ];
    
    for (const project of projectTypes) {
      if (project.keywords.some(keyword => msg.includes(keyword))) {
        newMetadata.project_type = project.type;
        console.log('Found NEW project type:', newMetadata.project_type);
        break;
      }
    }
  }

  // Extract name (only if we don't have one)
  if (!existingMetadata.name) {
    const namePatterns = [
      /my name is ([A-Za-z]+ [A-Za-z]+)/i,
      /i'?m ([A-Za-z]+ [A-Za-z]+)/i,
      /^([A-Za-z]+ [A-Za-z]+)$/i  // Just first and last name
    ];
    
    for (const pattern of namePatterns) {
      const nameMatch = currentMessage.match(pattern);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        // Validate name
        const invalidNames = ['yes sir', 'no sir', 'thank you', 'hello there', 'hi there'];
        if (name.length > 3 && 
            name.includes(' ') && 
            !invalidNames.includes(name.toLowerCase()) &&
            /^[A-Za-z\s]+$/.test(name)) {
          newMetadata.name = name;
          console.log('Found NEW name:', newMetadata.name);
          break;
        }
      }
    }
  }

  console.log('New metadata extracted:', newMetadata);
  return newMetadata;
}