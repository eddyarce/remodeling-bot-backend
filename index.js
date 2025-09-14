const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { sendQualifiedLeadEmail } = require('./services/emailService');

// Log environment variables (without exposing the full key)
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Handle /api/customers route
  if (url.pathname === '/api/customers') {
    
    // GET - Fetch customer data
    if (req.method === 'GET') {
      const customerId = url.searchParams.get('customerId');
      
      console.log('Received request for customer:', customerId);
      
      if (!customerId) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'Customer ID required' }));
        return;
      }

      try {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('customer_id', customerId)
          .single();

        console.log('Supabase query result:', { data, error });

        if (error || !data) {
          res.writeHead(200);
          res.end(JSON.stringify({ 
            success: false, 
            message: 'Customer not found',
            error: error?.message,
            customerId: customerId
          }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, customer: data }));
      } catch (err) {
        console.error('Error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Server error', error: err.message }));
      }
    }
    
    // POST - Create new customer
    else if (req.method === 'POST') {
      let body = '';
      
      // Collect the request body
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const customerData = JSON.parse(body);
          
          console.log('Creating new customer:', customerData.customer_id);
          
          // Validate required fields
          const required = ['customer_id', 'company_name', 'contact_email', 'service_areas', 'minimum_budget', 'timeline_threshold'];
          for (const field of required) {
            if (!customerData[field]) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, message: `${field} is required` }));
              return;
            }
          }
          
          // Insert into Supabase
          const { data, error } = await supabase
            .from('customers')
            .insert([customerData])
            .select()
            .single();
          
          if (error) {
            console.error('Supabase insert error:', error);
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, message: 'Failed to create customer', error: error.message }));
            return;
          }
          
          console.log('Customer created successfully:', data.customer_id);
          res.writeHead(201);
          res.end(JSON.stringify({ success: true, customer: data }));
          
        } catch (err) {
          console.error('Error parsing request:', err);
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, message: 'Invalid request', error: err.message }));
        }
      });
    }
    
   else {
      res.writeHead(405);
      res.end(JSON.stringify({ success: false, message: 'Method not allowed' }));
    }
  }
  // Handle /api/leads/notify-qualified route
  else if (url.pathname === '/api/leads/notify-qualified' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { customerId, leadData } = JSON.parse(body);
        
        console.log('Sending notification for customer:', customerId);
        
        // Fetch customer data
        const { data: customer, error } = await supabase
          .from('customers')
          .select('*')
          .eq('customer_id', customerId)
          .single();
        
        if (error || !customer) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, message: 'Customer not found' }));
          return;
        }
        
        // Send email
        const emailSent = await sendQualifiedLeadEmail(leadData, customer);
        
        res.writeHead(200);
        res.end(JSON.stringify({ 
          success: emailSent, 
          message: emailSent ? 'Notification sent' : 'Email failed but lead saved' 
        }));
        
      } catch (err) {
        console.error('Error sending notification:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Failed to send notification', error: err.message }));
      }
    });
  }

  } else {
    // Default response
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'LeadSavr API is running' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});