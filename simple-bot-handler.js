const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function handleSimpleBotMessage(req, res) {
  const { message, conversation_id } = req.body;
  const customerId = req.params.customerId;

  console.log('=== SIMPLE BOT START ===');
  console.log('Message:', message);
  console.log('Conversation ID:', conversation_id);

  try {
    // 1. Get customer data (same as before)
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 2. Get ALL conversation history
    const { data: history } = await supabase
      .from('conversations')
      .select('*')
      .eq('conversation_id', conversation_id)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    // 3. Build the conversation for OpenAI
    const messages = [
      {
        role: "system",
        content: `You are Mason, a friendly lead qualification assistant for ${customer.company_name}.

Your job is to qualify leads by collecting the following information in a natural conversation:
1. Project type (kitchen, bathroom, etc.)
2. ZIP code (must be in: ${customer.service_areas})
3. Budget (minimum: $${customer.minimum_budget})
4. Timeline (must be within ${customer.timeline_threshold} months)
5. Full name
6. Email address
7. Phone number

Be conversational and friendly. Ask for one piece of information at a time.

If they don't qualify:
- Wrong ZIP: Politely mention you only service ${customer.service_areas}
- Low budget: Mention your minimum is $${(customer.minimum_budget/1000).toFixed(0)}k
- Timeline too far: Mention you work with projects starting within ${customer.timeline_threshold} months

Once you have all 7 pieces of information and they qualify, thank them and let them know someone will reach out within 24 hours.

IMPORTANT: Remember what information you've already collected. Don't ask for the same thing twice.`
      }
    ];

    // Add conversation history
    if (history && history.length > 0) {
      history.forEach(msg => {
        messages.push({
          role: msg.role || 'user',
          content: msg.message
        });
      });
    }

    // Add the new message
    messages.push({
      role: "user",
      content: message
    });

    // 4. Get OpenAI's response
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
      temperature: 0.7,
      max_tokens: 200
    });

    const botResponse = completion.choices[0].message.content;

    // 5. Save both user message and bot response
    await supabase.from('conversations').insert([
      {
        conversation_id,
        customer_id: customerId,
        role: 'user',
        message: message,
        created_at: new Date().toISOString()
      },
      {
        conversation_id,
        customer_id: customerId,
        role: 'assistant',
        message: botResponse,
        created_at: new Date().toISOString()
      }
    ]);

    // 6. Simple qualification check (let OpenAI tell us)
    const checkMessages = [...messages, { role: "assistant", content: botResponse }];
    
    const qualificationCheck = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        ...checkMessages,
        {
          role: "user",
          content: "Based on this conversation, do we have all 7 required pieces of information (project, zip, budget, timeline, name, email, phone) and does the lead qualify? Respond with just YES or NO."
        }
      ],
      max_tokens: 10
    });

    const isQualified = qualificationCheck.choices[0].message.content.trim().toUpperCase() === 'YES';

    if (isQualified) {
      console.log('Lead qualified! Should trigger email.');
      // You can add email trigger here if needed
    }

    // 7. Return response
    res.json({
      response: botResponse,
      qualified: isQualified
    });

  } catch (error) {
    console.error('Simple bot error:', error);
    res.status(500).json({ 
      error: 'Bot error', 
      details: error.message 
    });
  }
}

module.exports = { handleSimpleBotMessage };
