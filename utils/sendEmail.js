const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, text, html, attachments }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Felicity Portal" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
      attachments, // NEW
    });

    console.log("Email sent to:", to);
  } catch (error) {
    console.error("Email sending failed:", error.message);
    throw error;
  }
};

module.exports = sendEmail;