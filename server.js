require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const eventRoutes = require("./routes/eventRoutes");
const adminRoutes = require("./routes/adminRoutes");
const participantRoutes = require("./routes/participantRoutes");

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded files (payment proofs etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/participants", participantRoutes);
app.use("/api/organizer", require("./routes/organizerRoutes"));
app.use("/api/forum", require("./routes/forumRoutes"));

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to MERN API' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
