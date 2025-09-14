const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendQualifiedLeadEmail = async (leadData, customerData) => {
  const msg = {
    to: customerData.contact_email,
    from: 'notifications@leadsavr.com', // UPDATE THIS
    subject: '🎉 New Qualified Lead - ' + (leadData.contact_name || 'Unknown'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">New Qualified Lead!</h1>
        </div>
        
        <div style="padding: 30px; background: #f7f8fa;">
          <h2 style="color: #333; margin-top: 0;">Lead Details</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 10px 0;"><strong>Name:</strong> ${leadData.contact_name || 'Not provided'}</p>
            <p style="margin: 10px 0;"><strong>Email:</strong> ${leadData.contact_email || 'Not provided'}</p>
            <p style="margin: 10px 0;"><strong>Phone:</strong> ${leadData.contact_phone || 'Not provided'}</p>
            <p style="margin: 10px 0;"><strong>Project Type:</strong> ${leadData.project_type || 'Not specified'}</p>
            <p style="margin: 10px 0;"><strong>Budget:</strong> $${leadData.budget || 'Not specified'}</p>
            <p style="margin: 10px 0;"><strong>Timeline:</strong> ${leadData.timeline || 'Not specified'} months</p>
            <p style="margin: 10px 0;"><strong>ZIP Code:</strong> ${leadData.zip_code || 'Not specified'}</p>
          </div>
          
          <div style="text-align: center;">
            <a href="https://app.leadsavr.com/dashboard" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">View in Dashboard</a>
          </div>
        </div>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log('Email sent successfully to:', customerData.contact_email);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

module.exports = { sendQualifiedLeadEmail };
