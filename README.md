# rooms. — Live Chat App

A real-time chat room app. No accounts, just codes.

## Features
- Create a room → get a unique 6-character code
- Join a room → enter the code + a nickname
- Real-time messaging via WebSockets
- 300-second inactivity timeout per user
- Leave button with confirmation

## Deploy to Render

1. Push this folder to a GitHub repository
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
5. Click Deploy

Render will auto-detect `render.yaml` if you use "Blueprint" deployment.

## Run Locally

```bash
npm install
node server.js
# Visit http://localhost:3000
```
