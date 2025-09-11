const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      return res.status(404).json({ 
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
    return res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};