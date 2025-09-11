const { createClient } = require('@supabase/supabase-js');

module.exports = (req, res) => {
  // Initialize Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Parse the query parameter
  const customerId = req.query.customerId;
  
  if (!customerId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Customer ID required' 
    });
  }

  // Get customer from database
  supabase
    .from('customers')
    .select('*')
    .eq('customer_id', customerId)
    .single()
    .then(({ data, error }) => {
      if (error || !data) {
        return res.status(200).json({ 
          success: false, 
          message: 'Customer not found' 
        });
      }
      
      res.status(200).json({
        success: true,
        customer: data
      });
    })
    .catch(err => {
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    });
};