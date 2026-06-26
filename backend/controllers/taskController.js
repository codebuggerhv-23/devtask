const Task = require('../models/Task');

// Create task
exports.createTask = async (req, res) => {
  try {
    const { title, description, priority, assignedTo, deadline } = req.body;

    const task = new Task({
      title,
      description,
      priority,
      assignedTo: assignedTo || req.user.userId,
      createdBy: req.user.userId,
      teamId: req.user.teamId,
      deadline
    });

    await task.save();
    
    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email');

    res.status(201).json({ message: 'Task created successfully', task: populatedTask });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all tasks for a team
exports.getTasks = async (req, res) => {
  try {
    const { status, priority } = req.query;
    const filter = { teamId: req.user.teamId };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Count by status
    const stats = {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      inProgress: tasks.filter(t => t.status === 'in-progress').length,
      done: tasks.filter(t => t.status === 'done').length
    };

    res.status(200).json({ tasks, stats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get single task
exports.getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email');

    if (!task) return res.status(404).json({ message: 'Task not found.' });
    if (task.teamId !== req.user.teamId) return res.status(403).json({ message: 'Access denied.' });

    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update task
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    if (task.teamId !== req.user.teamId) return res.status(403).json({ message: 'Access denied.' });

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    ).populate('assignedTo', 'name email').populate('createdBy', 'name email');

    res.status(200).json({ message: 'Task updated successfully', task: updatedTask });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update task status only
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    if (task.teamId !== req.user.teamId) return res.status(403).json({ message: 'Access denied.' });

    const previousStatus = task.status;
    task.status = status;
    await task.save();
    await task.populate('assignedTo', 'name email');

    // Update rating when task is marked as done
    if (status === 'done' && previousStatus !== 'done') {
      const User = require('../models/User');
      const assignedUser = await User.findById(task.assignedTo._id);

      if (assignedUser) {
        let ratingChange = 0;
        const now = new Date();
        const deadline = task.deadline ? new Date(task.deadline) : null;

        if (deadline) {
          const daysEarly = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
          if (daysEarly >= 2) {
            // Completed early — big bonus
            ratingChange = 50 + daysEarly * 10;
            assignedUser.tasksCompletedOnTime += 1;
          } else if (daysEarly >= 0) {
            // Completed on time — small bonus
            ratingChange = 25;
            assignedUser.tasksCompletedOnTime += 1;
          } else {
            // Completed late — penalty
            ratingChange = -30 * Math.abs(daysEarly);
            assignedUser.tasksCompletedLate += 1;
          }
        } else {
          // No deadline — small flat bonus
          ratingChange = 20;
          assignedUser.tasksCompletedOnTime += 1;
        }

        assignedUser.rating = Math.max(0, assignedUser.rating + ratingChange);
        assignedUser.tasksCompleted += 1;
        assignedUser.totalRatingChange += ratingChange;
        await assignedUser.save();

        return res.status(200).json({
          message: 'Status updated',
          task,
          ratingChange,
          newRating: assignedUser.rating
        });
      }
    }

    res.status(200).json({ message: 'Status updated', task });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete task
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    if (task.teamId !== req.user.teamId) return res.status(403).json({ message: 'Access denied.' });

    await Task.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};