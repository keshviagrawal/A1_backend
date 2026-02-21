const mongoose = require("mongoose");

const forumMessageSchema = new mongoose.Schema(
    {
        eventId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: true,
            index: true,
        },
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        authorName: {
            type: String,
            required: true,
        },
        authorRole: {
            type: String,
            enum: ["participant", "organizer"],
            required: true,
        },
        content: {
            type: String,
            required: true,
            maxlength: 2000,
        },
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ForumMessage",
            default: null,
        },
        isPinned: {
            type: Boolean,
            default: false,
        },
        isAnnouncement: {
            type: Boolean,
            default: false,
        },
        reactions: {
            type: Map,
            of: [mongoose.Schema.Types.ObjectId],
            default: {},
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ForumMessage", forumMessageSchema);
