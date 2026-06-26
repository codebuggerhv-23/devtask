import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const socket = io('https://devtask-backend-ek0x.onrender.com');

const getAvatar = (name) => {
  const colors = ['#1a73e8', '#e84c1a', '#1ae86a', '#e8c21a', '#9b1ae8', '#1ae8d4'];
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  const color = colors[name?.charCodeAt(0) % colors.length] || '#1a73e8';
  return { initials, color };
};

const getTaskHealth = (deadline, status) => {
  if (status === 'done') return { health: 100, color: '#51cf66', label: '✅ Complete' };
  if (!deadline) return { health: 100, color: '#51cf66', label: '🟢 Healthy' };
  const now = new Date();
  const due = new Date(deadline);
  const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    const health = Math.max(0, 100 - overdueDays * 15);
    return { health, color: '#ff0000', label: `💀 Overdue by ${overdueDays}d`, overdue: true };
  } else if (daysLeft === 0) {
    return { health: 20, color: '#ff4444', label: '🚨 Due Today!' };
  } else if (daysLeft <= 2) {
    return { health: 40, color: '#ff6b6b', label: `⚠️ ${daysLeft}d left` };
  } else if (daysLeft <= 4) {
    return { health: 65, color: '#ffa94d', label: `🟡 ${daysLeft}d left` };
  } else {
    return { health: Math.min(100, 60 + daysLeft * 5), color: '#51cf66', label: `🟢 ${daysLeft}d left` };
  }
};

const getRatingInfo = (rating) => {
  if (rating >= 2000) return { rank: '🏆 Grandmaster', color: '#ff6b6b', next: null };
  if (rating >= 1600) return { rank: '💎 Master', color: '#9b1ae8', next: 2000 };
  if (rating >= 1400) return { rank: '🥇 Expert', color: '#1a73e8', next: 1600 };
  if (rating >= 1200) return { rank: '🥈 Specialist', color: '#51cf66', next: 1400 };
  if (rating >= 1000) return { rank: '🥉 Pupil', color: '#ffa94d', next: 1200 };
  return { rank: '⚪ Newbie', color: '#aaa', next: 1000 };
};

const Dashboard = () => {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, todo: 0, inProgress: 0, done: 0 });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeTab, setActiveTab] = useState('board');
  const [selectedTask, setSelectedTask] = useState(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState({});
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', deadline: '' });
  const [profile, setProfile] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [ratingPopup, setRatingPopup] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };
  const savedUser = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    if (!token) { navigate('/'); return; }
    if (savedUser?.teamId) socket.emit('join_room', savedUser.teamId);
    fetchTasks();
    fetchProfile();
    fetchLeaderboard();

    socket.on('task_created', (data) => setTasks(prev => [data.task, ...prev]));
    socket.on('task_status_changed', (data) => setTasks(prev => prev.map(t => t._id === data.task._id ? data.task : t)));
    socket.on('new_comment', (data) => {
      setComments(prev => ({ ...prev, [data.taskId || taskId]: [...(prev[data.taskId || taskId] || []), data.comment] }));
    });

    return () => {
      socket.off('task_created');
      socket.off('task_status_changed');
      socket.off('new_comment');
    };
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get('https://devtask-backend-ek0x.onrender.com/api/tasks', { headers });
      setTasks(res.data.tasks);
      setStats(res.data.stats);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchProfile = async () => {
    try {
      const res = await axios.get('https://devtask-backend-ek0x.onrender.com/api/auth/profile', { headers });
      setProfile(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await axios.get('https://devtask-backend-ek0x.onrender.com/api/auth/leaderboard', { headers });
      setLeaderboard(res.data);
    } catch (err) { console.error(err); }
  };

  const createTask = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('https://devtask-backend-ek0x.onrender.com/api/tasks', form, { headers });
      socket.emit('task_created', { task: res.data.task, teamId: savedUser?.teamId });
      setTasks(prev => [res.data.task, ...prev]);
      setStats(prev => ({ ...prev, total: prev.total + 1, todo: prev.todo + 1 }));
      setForm({ title: '', description: '', priority: 'medium', deadline: '' });
      setShowForm(false);
    } catch (err) { console.error(err); }
  };

  const updateStatus = async (taskId, newStatus) => {
    try {
      const res = await axios.patch(`'https://devtask-backend-ek0x.onrender.com/api/tasks/${taskId}/status`, { status: newStatus }, { headers });
      socket.emit('task_status_changed', { task: res.data.task, teamId: savedUser?.teamId });
      setTasks(prev => prev.map(t => t._id === taskId ? res.data.task : t));

      // Show rating popup if task completed
      if (newStatus === 'done' && res.data.ratingChange !== undefined) {
        setRatingPopup({ change: res.data.ratingChange, newRating: res.data.newRating });
        fetchProfile();
        fetchLeaderboard();
        setTimeout(() => setRatingPopup(null), 3000);
      }
    } catch (err) { console.error(err); }
  };

  const deleteTask = async (taskId) => {
    try {
      await axios.delete(`'https://devtask-backend-ek0x.onrender.com/api/tasks/${taskId}`, { headers });
      setTasks(prev => prev.filter(t => t._id !== taskId));
      if (selectedTask?._id === taskId) setSelectedTask(null);
    } catch (err) { console.error(err); }
  };

  const addComment = (taskId) => {
    if (!comment.trim()) return;
    const newComment = { text: comment, author: savedUser?.name, time: new Date().toLocaleTimeString() };
    setComments(prev => ({ ...prev, [taskId]: [...(prev[data.taskId || taskId] || []), newComment] }));
    socket.emit('new_comment', { taskId, comment: newComment, teamId: savedUser?.teamId });
    setComment('');
  };

  const filteredTasks = tasks.filter(t => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase());
    const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchPriority && matchStatus;
  });

  const atRiskCount = tasks.filter(t => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date()).length;
  const columns = ['todo', 'in-progress', 'done'];
  const columnLabels = { 'todo': 'To Do', 'in-progress': 'In Progress', 'done': 'Done' };
  const columnColors = { 'todo': '#ff6b6b', 'in-progress': '#ffa94d', 'done': '#51cf66' };
  const priorityColors = { low: '#74c0fc', medium: '#ffa94d', high: '#ff6b6b' };
  const analyticsData = [
    { label: 'To Do', count: stats.todo, color: '#ff6b6b' },
    { label: 'In Progress', count: stats.inProgress, color: '#ffa94d' },
    { label: 'Done', count: stats.done, color: '#51cf66' },
  ];
  const priorityData = [
    { label: 'High', count: tasks.filter(t => t.priority === 'high').length, color: '#ff6b6b' },
    { label: 'Medium', count: tasks.filter(t => t.priority === 'medium').length, color: '#ffa94d' },
    { label: 'Low', count: tasks.filter(t => t.priority === 'low').length, color: '#74c0fc' },
  ];
  const maxCount = Math.max(...analyticsData.map(d => d.count), 1);
  const avatar = getAvatar(savedUser?.name);
  const ratingInfo = profile ? getRatingInfo(profile.rating) : null;

  return (
    <div style={styles.container}>
      {/* Rating Popup */}
      {ratingPopup && (
        <div style={{ ...styles.ratingPopup, background: ratingPopup.change >= 0 ? '#51cf66' : '#ff6b6b' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {ratingPopup.change >= 0 ? '🏆' : '💀'} {ratingPopup.change >= 0 ? '+' : ''}{ratingPopup.change} Rating
          </div>
          <div style={{ fontSize: '14px', marginTop: '4px' }}>New Rating: {ratingPopup.newRating}</div>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.logo}>DevTask</h1>
        <div style={styles.headerRight}>
          <div style={{ ...styles.avatar, background: avatar.color }}>{avatar.initials}</div>
          <span style={styles.userInfo}>{savedUser?.name} | Team: <strong>{savedUser?.teamId}</strong></span>
          {profile && <span style={{ fontSize: '13px', color: ratingInfo?.color, fontWeight: 'bold' }}>{ratingInfo?.rank} • {profile.rating}</span>}
          <button style={styles.logoutBtn} onClick={() => { logout(); navigate('/'); }}>Logout</button>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        {[
          ['Total', stats.total, '#1a73e8'],
          ['To Do', stats.todo, '#ff6b6b'],
          ['In Progress', stats.inProgress, '#ffa94d'],
          ['Done', stats.done, '#51cf66'],
          ['⚠️ At Risk', atRiskCount, '#e84393'],
        ].map(([label, count, color]) => (
          <div key={label} style={{ ...styles.statCard, borderTop: `4px solid ${color}` }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{count}</div>
            <div style={{ color: '#666', fontSize: '14px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {['board', 'analytics', 'profile', 'leaderboard'].map(tab => (
          <button key={tab} style={{ ...styles.tab, ...(activeTab === tab ? styles.activeTab : {}) }} onClick={() => setActiveTab(tab)}>
            {tab === 'board' ? '📋 Board' : tab === 'analytics' ? '📊 Analytics' : tab === 'profile' ? '👤 Profile' : '🏆 Leaderboard'}
          </button>
        ))}
      </div>

      {/* Board Tab */}
      {activeTab === 'board' && (
        <>
          <div style={styles.filterRow}>
            <input style={styles.searchInput} placeholder="🔍 Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
            <select style={styles.filterSelect} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select style={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="todo">To Do</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <button style={styles.addBtn} onClick={() => setShowForm(!showForm)}>
              {showForm ? '✕ Cancel' : '+ New Task'}
            </button>
          </div>

          {showForm && (
            <div style={styles.formCard}>
              <h3 style={{ marginBottom: '1rem' }}>Create New Task</h3>
              <form onSubmit={createTask}>
                <input style={styles.input} placeholder="Task title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                <input style={styles.input} placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                <select style={styles.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
                <input style={styles.input} type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                <button style={styles.submitBtn} type="submit">Create Task</button>
              </form>
            </div>
          )}

          {loading ? <div style={styles.loading}>Loading tasks...</div> : (
            <div style={styles.boardWrapper}>
              <div style={styles.board}>
                {columns.map(col => (
                  <div key={col} style={styles.column}>
                    <div style={{ ...styles.columnHeader, borderBottom: `3px solid ${columnColors[col]}` }}>
                      <span>{columnLabels[col]}</span>
                      <span style={styles.badge}>{filteredTasks.filter(t => t.status === col).length}</span>
                    </div>
                    {filteredTasks.filter(t => t.status === col).map(task => {
                      const ta = getAvatar(task.assignedTo?.name);
                      const health = getTaskHealth(task.deadline, task.status);
                      return (
                        <div key={task._id} style={{ ...styles.taskCard, ...(health.overdue ? styles.overdueCard : {}) }} onClick={() => setSelectedTask(task)}>
                          <div style={styles.taskHeader}>
                            <span style={{ ...styles.priorityBadge, background: priorityColors[task.priority] }}>{task.priority}</span>
                            <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); deleteTask(task._id); }}>✕</button>
                          </div>
                          <div style={styles.taskTitle}>{health.overdue && '💀 '}{task.title}</div>
                          {task.description && <div style={styles.taskDesc}>{task.description}</div>}
                          {task.deadline && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                                <span style={{ color: '#888' }}>📅 {new Date(task.deadline).toLocaleDateString()}</span>
                                <span style={{ color: health.color, fontWeight: 'bold' }}>{health.label}</span>
                              </div>
                              <div style={{ background: '#eee', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                                <div style={{ width: `${health.health}%`, height: '100%', background: health.color, borderRadius: '4px' }} />
                              </div>
                              <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>Health: {health.health}%</div>
                            </div>
                          )}
                          <div style={styles.taskFooter}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ ...styles.miniAvatar, background: ta.color }}>{ta.initials}</div>
                              <span style={{ fontSize: '11px', color: '#888' }}>{task.assignedTo?.name}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#aaa' }}>💬 {(comments[task._id] || []).length}</span>
                          </div>
                          <select style={styles.statusSelect} value={task.status}
                            onChange={e => { e.stopPropagation(); updateStatus(task._id, e.target.value); }}
                            onClick={e => e.stopPropagation()}>
                            <option value="todo">To Do</option>
                            <option value="in-progress">In Progress</option>
                            <option value="done">Done</option>
                          </select>
                        </div>
                      );
                    })}
                    {filteredTasks.filter(t => t.status === col).length === 0 && <div style={styles.emptyCol}>No tasks here</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div style={styles.analyticsContainer}>
          <div style={styles.analyticsCard}>
            <h3 style={styles.analyticsTitle}>Tasks by Status</h3>
            <div style={styles.chartRow}>
              {analyticsData.map(d => (
                <div key={d.label} style={styles.barWrapper}>
                  <div style={styles.barLabel}>{d.count}</div>
                  <div style={{ ...styles.bar, height: `${(d.count / maxCount) * 150}px`, background: d.color }} />
                  <div style={styles.barXLabel}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={styles.analyticsCard}>
            <h3 style={styles.analyticsTitle}>Tasks by Priority</h3>
            <div style={styles.chartRow}>
              {priorityData.map(d => (
                <div key={d.label} style={styles.barWrapper}>
                  <div style={styles.barLabel}>{d.count}</div>
                  <div style={{ ...styles.bar, height: `${(d.count / Math.max(...priorityData.map(p => p.count), 1)) * 150}px`, background: d.color }} />
                  <div style={styles.barXLabel}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={styles.analyticsCard}>
            <h3 style={styles.analyticsTitle}>Completion Rate</h3>
            <div style={styles.completionWrapper}>
              <div style={styles.completionCircle}>
                <span style={styles.completionPercent}>{stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%</span>
              </div>
              <p style={{ color: '#666', marginTop: '1rem' }}>{stats.done} of {stats.total} tasks completed</p>
            </div>
          </div>
          <div style={styles.analyticsCard}>
            <h3 style={styles.analyticsTitle}>⚠️ At Risk Tasks</h3>
            {tasks.filter(t => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date()).length === 0
              ? <p style={{ color: '#51cf66' }}>🎉 No overdue tasks!</p>
              : tasks.filter(t => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date()).map(t => {
                const h = getTaskHealth(t.deadline, t.status);
                return (
                  <div key={t._id} style={styles.riskItem}>
                    <div style={{ fontWeight: '500', fontSize: '13px' }}>💀 {t.title}</div>
                    <div style={{ background: '#eee', borderRadius: '4px', height: '6px', margin: '4px 0' }}>
                      <div style={{ width: `${h.health}%`, height: '100%', background: h.color, borderRadius: '4px' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: h.color }}>Health: {h.health}% — {h.label}</div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && profile && (() => {
        const ri = getRatingInfo(profile.rating);
        const onTimeRate = profile.tasksCompleted > 0 ? Math.round((profile.tasksCompletedOnTime / profile.tasksCompleted) * 100) : 0;
        const progressToNext = ri.next ? Math.round(((profile.rating - (ri.next - 400)) / 400) * 100) : 100;
        return (
          <div style={styles.analyticsContainer}>
            {/* Profile Card */}
            <div style={{ ...styles.analyticsCard, minWidth: '280px' }}>
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ ...styles.avatar, background: avatar.color, width: '80px', height: '80px', fontSize: '28px', margin: '0 auto 1rem' }}>{avatar.initials}</div>
                <h2 style={{ margin: '0 0 0.25rem', color: '#333' }}>{profile.name}</h2>
                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 0.5rem' }}>{profile.email}</p>
                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 1rem' }}>Team: <strong>{profile.teamId}</strong></p>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: ri.color }}>{ri.rank}</div>
                <div style={{ fontSize: '40px', fontWeight: 'bold', color: ri.color, margin: '0.5rem 0' }}>{profile.rating}</div>
                <div style={{ fontSize: '13px', color: '#888' }}>Rating Points</div>
                {ri.next && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                      <span>{ri.rank}</span><span>Next: {ri.next}</span>
                    </div>
                    <div style={{ background: '#eee', borderRadius: '4px', height: '8px' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, progressToNext))}%`, height: '100%', background: ri.color, borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{ri.next - profile.rating} points to next rank</div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Card */}
            <div style={{ ...styles.analyticsCard, minWidth: '280px' }}>
              <h3 style={styles.analyticsTitle}>📊 Performance Stats</h3>
              {[
                ['✅ Tasks Completed', profile.tasksCompleted, '#51cf66'],
                ['⚡ On Time', profile.tasksCompletedOnTime, '#1a73e8'],
                ['💀 Late', profile.tasksCompletedLate, '#ff6b6b'],
                ['📈 Total Rating Change', (profile.totalRatingChange >= 0 ? '+' : '') + profile.totalRatingChange, profile.totalRatingChange >= 0 ? '#51cf66' : '#ff6b6b'],
              ].map(([label, value, color]) => (
                <div key={label} style={styles.statRow}>
                  <span style={{ fontSize: '14px', color: '#555' }}>{label}</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color }}>{value}</span>
                </div>
              ))}
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ color: '#555' }}>On-Time Rate</span>
                  <span style={{ fontWeight: 'bold', color: onTimeRate >= 70 ? '#51cf66' : onTimeRate >= 40 ? '#ffa94d' : '#ff6b6b' }}>{onTimeRate}%</span>
                </div>
                <div style={{ background: '#eee', borderRadius: '4px', height: '10px' }}>
                  <div style={{ width: `${onTimeRate}%`, height: '100%', background: onTimeRate >= 70 ? '#51cf66' : onTimeRate >= 40 ? '#ffa94d' : '#ff6b6b', borderRadius: '4px' }} />
                </div>
              </div>
            </div>

            {/* Rating Guide */}
            <div style={{ ...styles.analyticsCard, minWidth: '280px' }}>
              <h3 style={styles.analyticsTitle}>🏅 Rating System</h3>
              {[
                ['🏆 Grandmaster', '2000+', '#ff6b6b'],
                ['💎 Master', '1600–1999', '#9b1ae8'],
                ['🥇 Expert', '1400–1599', '#1a73e8'],
                ['🥈 Specialist', '1200–1399', '#51cf66'],
                ['🥉 Pupil', '1000–1199', '#ffa94d'],
                ['⚪ Newbie', '0–999', '#aaa'],
              ].map(([rank, range, color]) => (
                <div key={rank} style={{ ...styles.statRow, background: profile.rating >= parseInt(range) ? '#f8f9fa' : 'transparent', borderRadius: '4px', padding: '6px 8px' }}>
                  <span style={{ fontSize: '13px', color, fontWeight: 'bold' }}>{rank}</span>
                  <span style={{ fontSize: '12px', color: '#888' }}>{range}</span>
                </div>
              ))}
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0f9ff', borderRadius: '6px', fontSize: '12px', color: '#555' }}>
                <div>⚡ Complete early: <strong style={{ color: '#51cf66' }}>+50 to +100</strong></div>
                <div>✅ Complete on time: <strong style={{ color: '#1a73e8' }}>+25</strong></div>
                <div>💀 Complete late: <strong style={{ color: '#ff6b6b' }}>-30 per day</strong></div>
                <div>📋 No deadline: <strong style={{ color: '#ffa94d' }}>+20</strong></div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div style={{ padding: '1rem 2rem' }}>
          <div style={styles.analyticsCard}>
            <h3 style={styles.analyticsTitle}>🏆 Team Leaderboard — {savedUser?.teamId}</h3>
            {leaderboard.length === 0
              ? <p style={{ color: '#aaa' }}>No team members found.</p>
              : leaderboard.map((u, i) => {
                const ua = getAvatar(u.name);
                const uri = getRatingInfo(u.rating);
                const isMe = u.email === savedUser?.email;
                return (
                  <div key={u._id} style={{ ...styles.leaderRow, ...(isMe ? styles.leaderRowMe : {}) }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: i === 0 ? '#ffa94d' : i === 1 ? '#aaa' : i === 2 ? '#cd7f32' : '#666', minWidth: '32px' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div style={{ ...styles.miniAvatar, background: ua.color, width: '36px', height: '36px', fontSize: '13px' }}>{ua.initials}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', fontSize: '14px' }}>{u.name} {isMe && <span style={{ fontSize: '11px', color: '#1a73e8' }}>(you)</span>}</div>
                      <div style={{ fontSize: '12px', color: uri.color }}>{uri.rank}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: uri.color }}>{u.rating}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{u.tasksCompleted} tasks done</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div style={styles.modalOverlay} onClick={() => setSelectedTask(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>{selectedTask.title}</h3>
              <button style={styles.closeBtn} onClick={() => setSelectedTask(null)}>✕</button>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <span style={{ ...styles.priorityBadge, background: priorityColors[selectedTask.priority] }}>{selectedTask.priority}</span>
              <span style={{ marginLeft: '0.5rem', fontSize: '13px', color: '#666' }}>Status: {selectedTask.status}</span>
            </div>
            {selectedTask.description && <p style={{ color: '#444', fontSize: '14px' }}>{selectedTask.description}</p>}
            {selectedTask.deadline && (() => {
              const h = getTaskHealth(selectedTask.deadline, selectedTask.status);
              return (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span>📅 {new Date(selectedTask.deadline).toLocaleDateString()}</span>
                    <span style={{ color: h.color, fontWeight: 'bold' }}>{h.label}</span>
                  </div>
                  <div style={{ background: '#eee', borderRadius: '4px', height: '8px' }}>
                    <div style={{ width: `${h.health}%`, height: '100%', background: h.color, borderRadius: '4px' }} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Task Health: {h.health}%</div>
                </div>
              );
            })()}
            <p style={{ fontSize: '13px', color: '#888' }}>👤 Assigned to: {selectedTask.assignedTo?.name}</p>
            <div style={styles.commentsSection}>
              <h4 style={{ marginBottom: '0.75rem' }}>💬 Activity Log</h4>
              <div style={styles.commentsList}>
                {(comments[selectedTask._id] || []).length === 0
                  ? <p style={{ color: '#aaa', fontSize: '13px' }}>No comments yet. Be the first!</p>
                  : (comments[selectedTask._id] || []).map((c, i) => {
                    const ca = getAvatar(c.author);
                    return (
                      <div key={i} style={styles.commentItem}>
                        <div style={{ ...styles.miniAvatar, background: ca.color }}>{ca.initials}</div>
                        <div>
                          <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{c.author}</span>
                          <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '8px' }}>{c.time}</span>
                          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#444' }}>{c.text}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div style={styles.commentInput}>
                <input style={{ ...styles.input, marginBottom: 0, flex: 1 }} placeholder="Add a comment..." value={comment}
                  onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment(selectedTask._id)} />
                <button style={styles.submitBtn} onClick={() => addComment(selectedTask._id)}>Send</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: { minHeight: '100vh', background: '#f0f2f5', fontFamily: 'Arial, sans-serif' },
  header: { background: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  logo: { color: '#1a73e8', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '13px' },
  miniAvatar: { width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '10px', flexShrink: 0 },
  userInfo: { fontSize: '14px', color: '#666' },
  logoutBtn: { padding: '0.5rem 1rem', background: '#ff6b6b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  statsRow: { display: 'flex', gap: '1rem', padding: '1.5rem 2rem 0', flexWrap: 'wrap' },
  statCard: { background: 'white', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', flex: '1', minWidth: '100px', textAlign: 'center' },
  tabs: { display: 'flex', gap: '0.5rem', padding: '1rem 2rem 0', flexWrap: 'wrap' },
  tab: { padding: '0.5rem 1.25rem', background: 'white', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', color: '#666' },
  activeTab: { background: '#1a73e8', color: 'white', border: '1px solid #1a73e8' },
  filterRow: { display: 'flex', gap: '0.75rem', padding: '1rem 2rem', flexWrap: 'wrap', alignItems: 'center' },
  searchInput: { flex: 2, minWidth: '200px', padding: '0.6rem 1rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' },
  filterSelect: { padding: '0.6rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', background: 'white' },
  addBtn: { padding: '0.6rem 1.2rem', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' },
  formCard: { background: 'white', margin: '0 2rem 1rem', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
  input: { width: '100%', padding: '0.6rem', marginBottom: '0.75rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' },
  submitBtn: { padding: '0.6rem 1.5rem', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  boardWrapper: { padding: '0 2rem 2rem', overflowX: 'auto' },
  board: { display: 'flex', gap: '1rem', minWidth: '800px' },
  column: { flex: '1', minWidth: '260px', background: 'white', borderRadius: '8px', padding: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
  columnHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', marginBottom: '1rem', fontWeight: 'bold', fontSize: '15px' },
  badge: { background: '#f0f2f5', padding: '2px 8px', borderRadius: '12px', fontSize: '13px' },
  taskCard: { background: '#f8f9fa', border: '1px solid #eee', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer' },
  overdueCard: { background: '#fff5f5', border: '1px solid #ffcccc' },
  taskHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  priorityBadge: { fontSize: '11px', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '14px' },
  taskTitle: { fontWeight: '500', fontSize: '14px', marginBottom: '0.25rem' },
  taskDesc: { fontSize: '12px', color: '#666', marginBottom: '0.25rem' },
  taskFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  statusSelect: { width: '100%', padding: '0.35rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' },
  emptyCol: { textAlign: 'center', color: '#bbb', fontSize: '13px', padding: '2rem 0' },
  loading: { textAlign: 'center', padding: '3rem', color: '#666' },
  analyticsContainer: { display: 'flex', gap: '1rem', padding: '1rem 2rem 2rem', flexWrap: 'wrap' },
  analyticsCard: { background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', flex: '1', minWidth: '220px' },
  analyticsTitle: { marginBottom: '1.5rem', color: '#333', fontSize: '16px' },
  chartRow: { display: 'flex', gap: '2rem', alignItems: 'flex-end', height: '180px', paddingBottom: '1rem' },
  barWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 },
  bar: { width: '100%', minHeight: '4px', borderRadius: '4px 4px 0 0' },
  barLabel: { fontSize: '18px', fontWeight: 'bold', color: '#333' },
  barXLabel: { fontSize: '12px', color: '#666', textAlign: 'center' },
  completionWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' },
  completionCircle: { width: '120px', height: '120px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '8px solid #51cf66', boxShadow: '0 4px 12px rgba(81,207,102,0.3)' },
  completionPercent: { fontSize: '24px', fontWeight: 'bold', color: '#51cf66' },
  riskItem: { background: '#fff5f5', border: '1px solid #ffcccc', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.5rem' },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' },
  leaderRow: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.5rem', border: '1px solid #eee' },
  leaderRowMe: { background: '#f0f7ff', border: '1px solid #1a73e8' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'white', borderRadius: '8px', padding: '1.5rem', width: '90%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' },
  commentsSection: { borderTop: '1px solid #eee', paddingTop: '1rem', marginTop: '1rem' },
  commentsList: { maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' },
  commentItem: { display: 'flex', gap: '8px', marginBottom: '0.75rem', alignItems: 'flex-start' },
  commentInput: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  ratingPopup: { position: 'fixed', top: '20px', right: '20px', padding: '1rem 1.5rem', borderRadius: '8px', color: 'white', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', textAlign: 'center', animation: 'fadeIn 0.3s ease' },
};

export default Dashboard;