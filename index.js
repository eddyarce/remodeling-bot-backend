if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
// Test route to check environment variables
app.get('/api/test-env', (req, res) => {
  res.json({
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
    urlLength: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.length : 0,
    keyLength: process.env.SUPABASE_ANON_KEY ? process.env.SUPABASE_ANON_KEY.length : 0
  });
});
// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    // Try to get count of customers
    const { count, error } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      res.json({ 
        success: false, 
        error: error.message,
        details: error 
      });
    } else {
      res.json({ 
        success: true, 
        customerCount: count,
        message: 'Database connected successfully'
      });
    }
  } catch (err) {
    res.json({ 
      success: false, 
      error: err.message 
    });
  }
});
// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Basic test route
app.get('/', (req, res) => {
  res.json({ message: 'Remodeling SaaS API Server Running!' });
});

// Customer registration endpoint
app.post('/api/customers', async (req, res) => {
  try {
    const { companyName, contactEmail, serviceAreas } = req.body;
    
    // Generate customer ID
    const customerId = 'CUSTOMER_' + Date.now();
    
    // Save to Supabase database
    const { data, error } = await supabase
      .from('customers')
      .insert([
        {
          customer_id: customerId,
          company_name: companyName,
          contact_email: contactEmail,
          service_areas: serviceAreas,
          minimum_budget: 75000,
          timeline_threshold: 12
        }
      ])
      .select();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error occurred' 
      });
    }

    console.log('Customer saved to database:', data[0]);
    
// Generate customer setup instructions and embed code
const setupInstructions = {
  customerId: customerId,
  companyName: companyName,
  serviceAreas: serviceAreas,
  configurationSteps: [
    `1. Go to your Botpress Studio → Bot Settings → Configuration Variables`,
    `2. Add/Update these variables:`,
    `   - CUSTOMER_ID: ${customerId}`,
    `   - COMPANY_NAME: ${companyName}`,
    `   - SERVICE_AREAS: ${serviceAreas}`,
    `   - MINIMUM_BUDGET: 75000`,
    `   - TIMELINE_THRESHOLD: 12`,
    `3. Save and Publish your bot`,
    `4. Copy the embed code below to your website`
  ],
embedCode: `<script>
  window.botpressWebchatConfig = {
    botId: "192fdc5c-232a-4f2a-980c-f77186607bdc",
    hostUrl: "https://cdn.botpress.cloud/webchat/v2.2/",
    messagingUrl: "https://messaging.botpress.cloud",
    clientId: "192fdc5c-232a-4f2a-980c-f77186607bdc",
    webhookId: "your-webhook-id",
    lazySocket: true,
    frontendVersion: "v2.2",
    useSessionStorage: true,
    enableConversationDeletion: true,
    theme: "prism",
    themeColor: "#2563eb",
    customData: {
      customerId: "${customerId}"
    }
  };
</script>
<script src="https://cdn.botpress.cloud/webchat/v2.2/inject.js"></script>`,
  welcomeMessage: `Welcome ${companyName}! Your bot is ready to capture qualified remodeling leads.`
};

console.log('Setup instructions generated for:', customerId);
console.log(JSON.stringify(setupInstructions, null, 2));
    
    res.json({
      success: true,
      customerId: customerId,
      message: 'Customer registered and saved to database successfully'
    });
    
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred' 
    });
  }
});

// Get customer details by ID endpoint
app.get('/api/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (error || !data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    res.json({
      success: true,
      customer: data
    });
    
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error occurred' 
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});