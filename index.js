const http = require('http');
require('dotenv').config(); // Load environment variables
const { createClient } = require('@supabase/supabase-js');
const { sendQualifiedLeadEmail } = require('./services/emailService.js');

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
  const origin = req.headers.origin;
  if (origin && (origin.includes('localhost:3000') || origin.includes('localhost:3001'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://widget.leadsavr.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  // Handle /api/dashboard/leads route
  else if (url.pathname === '/api/dashboard/leads' && req.method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
      return;
    }
    
    try {
      // For now, use a simple token check - in production, use proper JWT validation
      const { data: leads, error } = await supabase
        .from('conversations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching leads:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Failed to fetch leads' }));
        return;
      }
      
      // Parse metadata for each lead
      const parsedLeads = (leads || []).map(lead => {
        let metadata = {};
        try {
          metadata = lead.metadata ? JSON.parse(lead.metadata) : {};
        } catch (e) {
          console.error('Error parsing metadata:', e);
        }
        
        return {
          ...lead,
          contact_name: metadata.name || null,
          contact_email: metadata.email || null,
          contact_phone: metadata.phone || null,
          project_type: metadata.project_type || null,
          budget: metadata.budget || null,
          timeline: metadata.timeline_months || null,
          zip_code: metadata.zip_code || null
        };
      });
      
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, leads: parsedLeads }));
    } catch (err) {
      console.error('Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, message: 'Server error' }));
    }
  }
  // Handle /api/dashboard/analytics route
  else if (url.pathname === '/api/dashboard/analytics' && req.method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
      return;
    }
    
    try {
      const { data: leads } = await supabase
        .from('conversations')
        .select('is_qualified, created_at, budget');
      
      const analytics = {
        totalLeads: leads?.length || 0,
        qualifiedLeads: leads?.filter(l => l.is_qualified).length || 0,
        conversionRate: leads?.length ? ((leads.filter(l => l.is_qualified).length / leads.length) * 100).toFixed(1) : 0,
        avgBudget: leads?.length ? Math.round(leads.reduce((sum, l) => sum + (l.budget || 0), 0) / leads.length) : 0
      };
      
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, ...analytics }));
    } catch (err) {
      console.error('Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, message: 'Server error' }));
    }
  }
  // Handle /api/leads/update-status route
  else if (url.pathname === '/api/leads/update-status' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { conversationId, isQualified, leadStatus, contactInfo } = JSON.parse(body);
        
        console.log('Updating lead status for conversation:', conversationId);
        
        // Update lead in database
        const updateData = {
          is_qualified: isQualified,
          lead_status: leadStatus,
          ...(contactInfo && {
            contact_name: contactInfo.name,
            contact_email: contactInfo.email,
            contact_phone: contactInfo.phone
          })
        };
        
        const { data, error } = await supabase
          .from('conversations')
          .update(updateData)
          .eq('conversation_id', conversationId)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating lead:', error);
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, message: 'Failed to update lead', error: error.message }));
          return;
        }
        
        // If qualified, send email notification
        if (isQualified && data.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('*')
            .eq('customer_id', data.customer_id)
            .single();
          
          if (customer) {
            await sendQualifiedLeadEmail(data, customer);
          }
        }
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, lead: data }));
        
      } catch (err) {
        console.error('Error updating lead status:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Failed to update status', error: err.message }));
      }
    });
  }
  else {
    // Default response
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'LeadSavr API is running' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});