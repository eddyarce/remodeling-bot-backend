const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Set CORS headers for ALL responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Log the request for debugging
  console.log('Request method:', req.method);
  console.log('Request query:', req.query);
  console.log('Request headers:', req.headers);

  // Initialize Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Extract customer ID from query string
  const { customerId } = req.query;
  
  if (!customerId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Customer ID required. Use ?customerId=CUSTOMER_XXX' 
    });
  }

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (error || !data) {
      // Don't return 404, return 200 with success: false
      return res.status(200).json({ 
        success: false, 
        message: 'Customer not found',
        error: error?.message 
      });
    }

    return res.status(200).json({
      success: true,
      customer: data
    });
  } catch (error) {
    // Don't return 500, return 200 with success: false
    return res.status(200).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};