module.exports = async (req, res) => {
  // Just return test9 data directly - no database call
  res.status(200).json({
    success: true,
    customer: {
      customer_id: "CUSTOMER_1757486321128",
      company_name: "test9",
      contact_email: "test9@gmail.com",
      service_areas: "90210",
      minimum_budget: 75000,
      timeline_threshold: 12
    }
  });
};