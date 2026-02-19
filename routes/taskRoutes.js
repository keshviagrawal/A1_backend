const express = require('express');
const router = express.Router();
const { getTasks, createTask } = require('../controllers/taskController');

router.route('/').get(getTasks).post(createTask);

module.exports = router;

// maps urls to controller, like which url triggers which logic