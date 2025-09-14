const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendQualifiedLeadEmail = async (leadData, customerData) => {
  const msg = {
    to: customerData.contact_email,
    from: 'notifications@leadsavr.com', // CHANGE THIS TO YOUR VERIFIED EMAIL
    subject: '🎉 New Qualified Lead - ' + (leadData.contact_name || 'Unknown'),
    html: `<div>New qualified lead: ${JSON.stringify(leadData)}</div>`
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
EOF