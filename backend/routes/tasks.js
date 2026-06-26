const express = require('express');
const router = express.Router();
const {
  createTask, getTasks, getTask,
  updateTask, updateStatus, deleteTask
} = require('../controllers/taskController');
const authMiddleware = require('../middleware/auth');

// All task routes are protected
router.use(authMiddleware);

router.post('/', createTask);
router.get('/', getTasks);
router.get('/:id', getTask);
router.put('/:id', updateTask);
router.patch('/:id/status', updateStatus);
router.delete('/:id', deleteTask);

module.exports = router;