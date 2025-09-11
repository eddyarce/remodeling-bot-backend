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

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Serve the bot host page
  if (url.pathname === '/bot-host') {
    const customerId = url.searchParams.get('customerId') || 'DEFAULT';
    
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Remodeling Bot</title>
    <style>
        body { margin: 0; padding: 0; }
    </style>
</head>
<body>
    <script>
        window.CUSTOMER_ID = '${customerId}';
        console.log('Bot initialized for customer:', '${customerId}');
    </script>
    <script src="https://cdn.botpress.cloud/webchat/v3.2/inject.js"></script>
    <script src="https://files.bpcontent.cloud/2025/09/05/19/20250905193502-3X1VD4LZ.js" defer></script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(html);
    return;
  }
  
  // Set JSON content type for API routes
  res.setHeader('Content-Type', 'application/json');
  
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