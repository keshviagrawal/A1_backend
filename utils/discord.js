const axios = require('axios');

exports.sendToDiscord = async (webhookUrl, event) => {
    if (!webhookUrl) return;

    try {
        await axios.post(webhookUrl, {
            content: `📢 **New Event Published!**\n\n**${event.eventName}**\n${event.description}\n\n📅 Date: ${new Date(event.eventStartDate).toDateString()}`
        });
        console.log(`Notification sent to Discord for event: ${event.eventName}`);
    } catch (error) {
        console.error("Failed to send Discord notification:", error.message);
    }
};
