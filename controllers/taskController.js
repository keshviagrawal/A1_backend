const Task = require('../models/Task');

exports.getTasks = async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.json({ success: true, data: tasks });
};

exports.createTask = async (req, res) => {
  const task = await Task.create(req.body);
  res.status(201).json({ success: true, data: task });
};

// this file is for containing fns that do the work
// ex - create user, create events, register participants... like what happen when an API is called