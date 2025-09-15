// Quick script to create the missing customer record
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createTestCustomer() {
  console.log('Creating missing customer record...');
  
  const customerData = {
    customer_id: 'CUSTOMER_1757835381571NCBTR',
    company_name: 'test company',
    contact_email: 'edarce01@gmail.com',
    service_areas: '90210',
    minimum_budget: 75000,
    timeline_threshold: 12
  };
  
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert([customerData])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating customer:', error);
    } else {
      console.log('Customer created successfully:', data);
    }
  } catch (err) {
    console.error('Exception:', err);
  }
}

module.exports = { createTestCustomer };