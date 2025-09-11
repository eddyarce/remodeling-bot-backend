module.exports = async (req, res) => {
  // Skip all security - just return the data
  const { createClient } = require('@supabase/supabase-js');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Get customerId from query
  const customerId = req.query.customerId || 'CUSTOMER_1757486321128';

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('customer_id', customerId)
    .single();

  // Always return 200 with data
  res.status(200).json({
    success: !error,
    customer: data,
    error: error?.message
  });
};