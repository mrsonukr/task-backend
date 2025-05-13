const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Get all tasks (admin only)
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const tasks = await Task.find()
      .populate('createdBy', 'fullName username email')
      .populate('assignedTo', 'fullName username email')
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tasks created by user
router.get('/created', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ createdBy: req.user.userId })
      .populate('createdBy', 'fullName username email')
      .populate('assignedTo', 'fullName username email')
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching created tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tasks assigned to user
router.get('/assigned', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ assignedTo: req.user.userId })
      .populate('createdBy', 'fullName username email')
      .populate('assignedTo', 'fullName username email')
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching assigned tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new task
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, assignedTo } = req.body;

    const task = new Task({
      title,
      description,
      status,
      priority,
      dueDate,
      createdBy: req.user.userId,
      assignedTo
    });

    await task.save();

    // Create notifications for assigned users
    const notifications = assignedTo.map(userId => ({
      type: 'task_assigned',
      taskId: task._id,
      message: `You have been assigned a new task: ${title}`,
      userId
    }));

    await Notification.insertMany(notifications);

    const populatedTask = await Task.findById(task._id)
      .populate('createdBy', 'fullName username email')
      .populate('assignedTo', 'fullName username email');

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update task
router.put('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Only creator can update task details
    if (task.createdBy.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to update this task' });
    }

    const { title, description, status, priority, dueDate, assignedTo } = req.body;
    const updates = { title, description, status, priority, dueDate };
    
    if (assignedTo) {
      updates.assignedTo = assignedTo;
      
      // Create notifications for newly assigned users
      const newAssignees = assignedTo.filter(
        userId => !task.assignedTo.includes(userId)
      );
      
      if (newAssignees.length > 0) {
        const notifications = newAssignees.map(userId => ({
          type: 'task_assigned',
          taskId: task._id,
          message: `You have been assigned to the task: ${title}`,
          userId
        }));
        
        await Notification.insertMany(notifications);
      }
    }

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    )
    .populate('createdBy', 'fullName username email')
    .populate('assignedTo', 'fullName username email');

    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update task status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if user is assigned to the task
    if (!task.assignedTo.includes(req.user.userId)) {
      return res.status(403).json({ message: 'Not authorized to update this task' });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    )
    .populate('createdBy', 'fullName username email')
    .populate('assignedTo', 'fullName username email');

    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Only creator can delete task
    if (task.createdBy.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    await task.deleteOne();
    await Notification.deleteMany({ taskId: task._id });

    res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;