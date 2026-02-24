const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/authMiddleware");
const forumController = require("../controllers/forumController");

// All routes require authentication
router.get("/:eventId", authenticate, forumController.getMessages);
router.post("/:eventId", authenticate, forumController.postMessage);
router.delete("/:eventId/:messageId", authenticate, forumController.deleteMessage);
router.patch("/:eventId/:messageId/pin", authenticate, forumController.togglePin);
router.post("/:eventId/:messageId/react", authenticate, forumController.addReaction);

module.exports = router;
