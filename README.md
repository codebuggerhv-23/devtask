# DevTask — Collaborative Task Manager

A full-stack real-time collaborative task management system with a gamified rating system, Kanban board, and task health tracking.

🔗 **Live Demo:** https://devtask-sage-theta.vercel.app

## Features

- 🔐 **JWT Authentication** — Secure register/login with bcrypt password hashing
- 📋 **Kanban Board** — Drag tasks across Todo / In Progress / Done columns
- ⚡ **Real-Time Sync** — WebSocket-based live updates across all team members instantly
- 💀 **Task Health System** — Tasks lose health points as deadlines approach; overdue tasks marked with skull indicator
- 🏆 **Rating System** — Users earn/lose rating points based on task completion speed (Newbie → Grandmaster)
- 👥 **Team Leaderboard** — Compare ratings with teammates in real time
- 👤 **User Profiles** — Track personal stats, on-time rate, and rank progression
- 💬 **Activity Log** — Comment on tasks with real-time updates across team
- 🔍 **Search & Filters** — Filter tasks by priority, status, or keyword
- 📊 **Analytics Dashboard** — Visual charts for task distribution and completion rate

## Tech Stack

**Backend**
- Node.js + Express.js
- MongoDB + Mongoose
- Socket.io (WebSockets)
- JWT + bcryptjs

**Frontend**
- React.js
- Axios
- Socket.io-client
- React Router DOM

**Deployment**
- Backend: Render
- Frontend: Vercel
- Database: MongoDB Atlas

## Architecture
