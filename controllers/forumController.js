const ForumMessage = require("../models/ForumMessage");
const Registration = require("../models/Registration");
const OrganizerProfile = require("../models/OrganizerProfile");
const ParticipantProfile = require("../models/ParticipantProfile");

// Get all messages for an event
exports.getMessages = async (req, res) => {
    try {
        const { eventId } = req.params;
        const messages = await ForumMessage.find({ eventId }).sort({ createdAt: 1 });

        // Convert reactions Map to plain object for JSON serialization
        const formatted = messages.map((msg) => {
            const m = msg.toObject();
            if (m.reactions instanceof Map) {
                m.reactions = Object.fromEntries(m.reactions);
            }
            return m;
        });

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch messages", error: err.message });
    }
};

// Post a message
exports.postMessage = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { content, parentId, isAnnouncement } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ message: "Message content is required" });
        }

        const userId = req.user.userId;
        const role = req.user.role;
        let authorName = "Unknown";

        if (role === "organizer") {
            const profile = await OrganizerProfile.findOne({ userId });
            authorName = profile?.organizerName || "Organizer";
        } else if (role === "participant") {
            // Check registration
            const registration = await Registration.findOne({
                eventId,
                participantId: await getParticipantId(userId),
                status: { $nin: ["CANCELLED"] },
            });
            if (!registration) {
                return res.status(403).json({ message: "You must be registered to post in this forum" });
            }
            const profile = await ParticipantProfile.findOne({ userId });
            authorName = profile ? `${profile.firstName} ${profile.lastName}` : "Participant";
        } else {
            return res.status(403).json({ message: "Not authorized to post" });
        }

        const message = await ForumMessage.create({
            eventId,
            authorId: userId,
            authorName,
            authorRole: role,
            content: content.trim(),
            parentId: parentId || null,
            isAnnouncement: role === "organizer" && isAnnouncement ? true : false,
        });

        const m = message.toObject();
        if (m.reactions instanceof Map) {
            m.reactions = Object.fromEntries(m.reactions);
        }

        // --- Send Email Notifications for @everyone ---
        if (role === "organizer" && content.includes("@everyone")) {
            try {
                const sendEmail = require("../utils/sendEmail");
                const Event = require("../models/Event");
                require("../models/User"); // Ensure User is loaded before populate

                const event = await Event.findById(eventId);

                if (event) {
                    // Find all valid registrations
                    const registrations = await Registration.find({
                        eventId,
                        status: { $nin: ["CANCELLED", "REJECTED"] }
                    }).populate({
                        path: "participantId",
                        populate: { path: "userId", select: "email" }
                    });

                    // Extract unique emails safely
                    const emails = [...new Set(registrations
                        .map(reg => reg.participantId && reg.participantId.userId ? reg.participantId.userId.email : null)
                        .filter(Boolean))];

                    if (emails.length > 0) {
                        // Send emails asynchronously in the background
                        Promise.allSettled(emails.map(email => sendEmail({
                            to: email,
                            subject: `📣 Announcement: ${event.eventName}`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                                    <h3 style="color: #2563eb;">New Announcement in ${event.eventName}</h3>
                                    <p><strong>${authorName}</strong> (Organizer) posted an update:</p>
                                    <div style="background-color: #f3f4f6; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
                                        ${content.replace(/@everyone/g, '<strong>@everyone</strong>')}
                                    </div>
                                    <p style="color: #6b7280; font-size: 14px;">Log in to the Felicity Portal to view the discussion and reply.</p>
                                </div>
                            `
                        }))).then(results => {
                            const failed = results.filter(r => r.status === 'rejected');
                            if (failed.length > 0) {
                                console.error(`Failed to send ${failed.length} @everyone emails`);
                            }
                        }).catch(err => {
                            console.error("Critical error sending @everyone emails:", err);
                        });
                    }
                }
            } catch (emailErr) {
                console.error("Error generating @everyone emails:", emailErr);
            }
        }

        res.status(201).json(m);
    } catch (err) {
        console.error("Error in postMessage:", err);
        res.status(500).json({ message: "Failed to post message", error: err.message });
    }
};

// Delete a message
exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.userId;
        const role = req.user.role;

        const message = await ForumMessage.findById(messageId);
        if (!message) return res.status(404).json({ message: "Message not found" });

        // Organizers can delete any message; participants only their own
        if (role !== "organizer" && message.authorId.toString() !== userId) {
            return res.status(403).json({ message: "Not authorized to delete this message" });
        }

        // Also delete all replies to this message
        await ForumMessage.deleteMany({ parentId: messageId });
        await ForumMessage.findByIdAndDelete(messageId);

        res.json({ message: "Message deleted" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete message", error: err.message });
    }
};

// Toggle pin on a message (organizer only)
exports.togglePin = async (req, res) => {
    try {
        if (req.user.role !== "organizer") {
            return res.status(403).json({ message: "Only organizers can pin messages" });
        }

        const { messageId } = req.params;
        const message = await ForumMessage.findById(messageId);
        if (!message) return res.status(404).json({ message: "Message not found" });

        message.isPinned = !message.isPinned;
        await message.save();

        res.json({ message: `Message ${message.isPinned ? "pinned" : "unpinned"}`, isPinned: message.isPinned });
    } catch (err) {
        res.status(500).json({ message: "Failed to toggle pin", error: err.message });
    }
};

// Add/remove a reaction
exports.addReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user.userId;

        if (!emoji) return res.status(400).json({ message: "Emoji is required" });

        const message = await ForumMessage.findById(messageId);
        if (!message) return res.status(404).json({ message: "Message not found" });

        const existing = message.reactions.get(emoji) || [];
        const userIndex = existing.findIndex((id) => id.toString() === userId);

        if (userIndex === -1) {
            existing.push(userId);
        } else {
            existing.splice(userIndex, 1);
        }

        message.reactions.set(emoji, existing);
        await message.save();

        const m = message.toObject();
        if (m.reactions instanceof Map) {
            m.reactions = Object.fromEntries(m.reactions);
        }

        res.json(m);
    } catch (err) {
        res.status(500).json({ message: "Failed to update reaction", error: err.message });
    }
};

// Helper to get participant profile ID from user ID
async function getParticipantId(userId) {
    const profile = await ParticipantProfile.findOne({ userId });
    return profile?._id;
}
