const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Log to check if env vars are loaded
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('Key starts with:', process.env.OPENAI_API_KEY?.substring(0, 7));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'missing-key'
});

// Main bot handler
async function handleBotMessage(req, res) {
  const { message, conversation_id } = req.body;
  const customerId = req.params.customerId;

  console.log('Processing message for conversation:', conversation_id);

  try {
    // 1. Check if conversation exists (using maybeSingle to avoid errors)
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('conversation_id', conversation_id)
      .maybeSingle(); // Returns null if not found, doesn't throw error

    console.log('Existing conversation found:', !!existing);

    // 2. Extract metadata from message (simple version)
    const metadata = extractMetadata(message);

    // 3. Determine qualification status
    const isQualified = checkIfQualified(metadata);
    const leadStatus = isQualified ? 'qualified' : 'in_progress';

    // 4. Create or update conversation
    if (!existing) {
      console.log('Creating new conversation');
      // Create new conversation
      const { data: newConv, error: insertError } = await supabase
        .from('conversations')
        .insert({
          conversation_id,
          customer_id: customerId,
          role: 'user',
          message,
          metadata: JSON.stringify(metadata),
          lead_status: leadStatus,
          is_qualified: isQualified,
          session_data: conversation_id // Add session_data field
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Insert error:', insertError);
        // Check if it's a duplicate key error
        if (insertError.code === '23505') {
          console.log('Conversation already exists, updating instead');
          // Try to update instead
          await updateExistingConversation(conversation_id, message, metadata, leadStatus, isQualified);
        } else {
          throw insertError;
        }
      }
    } else {
      console.log('Updating existing conversation');
      await updateExistingConversation(conversation_id, message, metadata, leadStatus, isQualified, existing);
    }

    // 5. Generate AI bot response
    const response = await generateAIResponse(message, metadata, existing);

    res.json({ response });

  } catch (error) {
    console.error('Bot error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
}

// Helper function to update existing conversation
async function updateExistingConversation(conversation_id, message, metadata, leadStatus, isQualified, existing = null) {
  const updatedMetadata = existing ? 
    { ...JSON.parse(existing.metadata || '{}'), ...metadata } : 
    metadata;
  
  const { error } = await supabase
    .from('conversations')
    .update({
      message,
      metadata: JSON.stringify(updatedMetadata),
      lead_status: leadStatus,
      is_qualified: isQualified
    })
    .eq('conversation_id', conversation_id);
  
  if (error) {
    console.error('Update error:', error);
    throw error;
  }
}

// Extract contact info and project details from message
function extractMetadata(message) {
  const metadata = {};
  
  // Extract email
  const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) metadata.email = emailMatch[0];
  
  // Extract phone
  const phoneMatch = message.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
  if (phoneMatch) metadata.phone = phoneMatch[0];
  
  // Extract budget
  const budgetMatch = message.match(/\$?([\d,]+)k?/i);
  if (budgetMatch) {
    let budget = parseInt(budgetMatch[1].replace(/,/g, ''));
    if (message.toLowerCase().includes('k')) budget *= 1000;
    metadata.budget = budget;
  }
  
  // Extract timeline
  if (message.match(/\d+\s*(month|week)/i)) {
    metadata.timeline_months = message.match(/(\d+)/)[0];
  }
  
  // Extract name (simple version)
  if (message.toLowerCase().includes('my name is')) {
    const nameMatch = message.match(/my name is (\w+ ?\w*)/i);
    if (nameMatch) metadata.name = nameMatch[1];
  }
  
  return metadata;
}

// Check if lead is qualified
function checkIfQualified(metadata) {
  return !!(
    metadata.email &&
    metadata.phone &&
    metadata.budget &&
    metadata.budget >= 50000 &&
    metadata.timeline_months
  );
}

// Generate appropriate bot response
function generateBotResponse(message, metadata) {
  const lowerMessage = message.toLowerCase();
  
  // Greeting
  if (!metadata.name) {
    return "Thanks for your interest! I'm Mason, your remodeling specialist. What's your name?";
  }
  
  // Ask for email
  if (!metadata.email) {
    return "Great to meet you! What's the best email to reach you at?";
  }
  
  // Ask for phone
  if (!metadata.phone) {
    return "Perfect! And what's your phone number?";
  }
  
  // Ask for project type
  if (!metadata.project_type) {
    return "What type of remodeling project are you considering? Kitchen, bathroom, or something else?";
  }
  
  // Ask for budget
  if (!metadata.budget) {
    return "To ensure we're the right fit, what's your approximate budget for this project?";
  }
  
  // Ask for timeline
  if (!metadata.timeline_months) {
    return "When are you hoping to start this project?";
  }
  
  // Qualified response
  if (metadata.budget >= 50000) {
    return "Excellent! You qualify for our premium remodeling service. One of our specialists will contact you within 24 hours to discuss your project in detail.";
  } else {
    return "Thank you for your interest! While your project is outside our current service range, we'd be happy to recommend some excellent contractors who specialize in projects of your scope.";
  }
}

// Generate AI-powered bot response
async function generateAIResponse(message, metadata, existingConversation) {
  try {
    // Build conversation history
    const conversationHistory = existingConversation ? 
      JSON.parse(existingConversation.metadata || '{}') : {};
    
    // Create the prompt for OpenAI
    const systemPrompt = `You are Mason, a friendly remodeling specialist assistant for a luxury remodeling company.
    Your goal is to qualify leads by collecting: name, email, phone, project type, budget, and timeline.
    Be conversational and professional. If they don't qualify (budget under $50k), be polite but clear.
    Current collected info: ${JSON.stringify(metadata)}`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 150
    });
    
    return completion.choices[0].message.content;
    
  } catch (error) {
    console.error('OpenAI error:', error);
    // Fallback to simple responses if AI fails
    return generateBotResponse(message, metadata);
  }
}

module.exports = { handleBotMessage };
