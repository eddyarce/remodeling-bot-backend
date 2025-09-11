const http = require('http');
const { createClient } = require('@supabase/supabase-js');

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
  res.setHeader('Content-Type', 'application/json');

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Handle /api/customers route
  if (url.pathname === '/api/customers') {
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
  } else {
    // Default response
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'API is running' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});