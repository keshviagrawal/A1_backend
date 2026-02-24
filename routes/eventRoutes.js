const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");

const {
  createEvent,
  publishEvent,
  getPublishedEvents,
  registerForEvent,
  purchaseMerchandise,
  getMerchandiseStock,
  getMyRegistrations,
  getEventRegistrations,
  getOrganizerDashboard,
  cancelRegistration,
  getTrendingEvents,
  getEventById,
  getTicketById,
  getEventAnalytics,
  updateEvent,
  markAttendance,
  exportParticipantsCSV,
  getOrganizerPublicDetails,
  getMerchOrders,
  approveMerchPayment,
  rejectMerchPayment,
  scanQRAttendance,
  manualOverrideAttendance,
} = require("../controllers/eventController");

const {
  authenticate,
  organizerOnly,
  disabledCheck,
} = require("../middleware/authMiddleware");

// --- 1. Specific / Static Routes (Risk-Free) ---
router.get("/trending", getTrendingEvents);
router.get("/tickets/:ticketId", getTicketById);

// --- 2. Organizer Specific Routes ---
router.post("/", authenticate, disabledCheck, organizerOnly, createEvent);
router.patch("/:eventId/publish", authenticate, disabledCheck, organizerOnly, publishEvent);
router.put("/:eventId/update", authenticate, disabledCheck, organizerOnly, updateEvent);
router.get("/organizer/dashboard", authenticate, disabledCheck, organizerOnly, getOrganizerDashboard);
router.get("/organizer/events/:eventId/analytics", authenticate, disabledCheck, organizerOnly, getEventAnalytics);
router.get("/:eventId/registrations", authenticate, disabledCheck, organizerOnly, getEventRegistrations);
router.get("/:eventId/csv", authenticate, disabledCheck, organizerOnly, exportParticipantsCSV);
router.post("/attendance/mark", authenticate, disabledCheck, organizerOnly, markAttendance);

// --- Attendance: QR Scan + Manual Override ---
router.post("/:eventId/attendance/scan", authenticate, disabledCheck, organizerOnly, scanQRAttendance);
router.post("/:eventId/attendance/manual", authenticate, disabledCheck, organizerOnly, manualOverrideAttendance);

// --- Merchandise Payment Approval Routes (organizer) ---
router.get("/:eventId/orders", authenticate, disabledCheck, organizerOnly, getMerchOrders);
router.patch("/:eventId/orders/:orderId/approve", authenticate, disabledCheck, organizerOnly, approveMerchPayment);
router.patch("/:eventId/orders/:orderId/reject", authenticate, disabledCheck, organizerOnly, rejectMerchPayment);

// --- 3. Participant Action Routes ---
router.post("/:eventId/register", authenticate, registerForEvent);
router.post("/:eventId/purchase", authenticate, upload.single("paymentProof"), purchaseMerchandise);
router.delete("/:eventId/register", authenticate, cancelRegistration);
router.get("/my-registrations", authenticate, getMyRegistrations);

// --- 4. Public Organizer Details (any authenticated user) ---
router.get("/organizers/:organizerId", authenticate, getOrganizerPublicDetails);

// --- 5. Generic ID Routes (MUST BE LAST) ---
router.get("/", authenticate, getPublishedEvents); // /api/events/
router.get("/:id", getEventById); // /api/events/:id

module.exports = router;