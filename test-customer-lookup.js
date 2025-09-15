// Quick customer database test script
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testCustomerLookup() {
  const customerId = 'CUSTOMER_1757835381571NCBTR';
  
  console.log('=== CUSTOMER LOOKUP TEST ===');
  console.log('Searching for customer ID:', customerId);
  
  try {
    // Test 1: Direct query
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle();
    
    console.log('Direct query result:');
    console.log('Data:', data);
    console.log('Error:', error);
    
    // Test 2: Get all customers to see what IDs exist
    const { data: allCustomers, error: allError } = await supabase
      .from('customers')
      .select('customer_id, company_name, contact_email')
      .limit(5);
      
    console.log('Sample customers in database:');
    console.log(allCustomers);
    console.log('All customers error:', allError);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Export for testing
module.exports = { testCustomerLookup };