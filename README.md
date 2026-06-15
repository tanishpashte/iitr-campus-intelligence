# 🏛️ IITR Campus Intelligence Hub

A smart campus dashboard that brings together academic schedules, hostel information, library resources, and an AI assistant into a single platform.


## 📺 Demo

[![YouTube Demo](https://img.shields.io/badge/YouTube-Watch%20Demo-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/watch?v=hxH5SGzfOs8)

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live%20Deployment-black?style=for-the-badge&logo=vercel)](https://iitr-campus-intelligence.vercel.app/)


## ✨ Features

* View academic schedules and hostel mess menus in one place.
* Chat with an AI assistant for campus-related queries.
* Semantic search for policies and campus documents using FAISS.
* Microservice-based architecture for modular and scalable services.
* Automatic AI model failover for improved reliability.


## 🚀 Setup

### Clone the Repository

```bash
git clone https://github.com/tanishpashte/iitr-campus-intelligence.git
cd iitr-campus-intelligence
```

### Backend

Create a .env file inside the `campus-assistant-orchestrator` directory:

campus-assistant-orchestrator/ <br>
├── .env <br>
├── api.py <br>
└── ... <br>

```env
GEMINI_API_KEY=your_api_key_here
```

Build and start the backend container:

```bash
docker build -t campus-intelligence .
docker run -p 8000:8000 --env-file .env campus-intelligence
```


### Frontend

```bash
cd dashboard-frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

