# 🎓 Stride — IBM AI Career Counseling Companion

> An AI-powered agentic career counseling web application built with **Python Flask** and **IBM Watsonx.ai (Llama model)**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Agent (Stride)** | Conversational career counselor powered by IBM Llama LLM |
| 📊 **Career Market Dashboard** | Visual charts of 10 career pathways with salary & growth data |
| ⚡ **Skill Gap Tracker** | Interactive self-assessment tool with personalized gap analysis |
| 📈 **Industry Trends 2025** | Curated WEF/BLS/McKinsey trend cards with sourced statistics |
| 🌙 **Dark Mode** | Full dark/light theme with persistent preference |
| 📱 **Mobile Responsive** | Works on all screen sizes with a bottom navigation bar |
| 🔒 **Secure Credentials** | IBM API keys loaded via `.env` file, never hard-coded |
| 🧠 **Agent Instructions** | Easily customize persona, tone, reasoning, and honesty rules |

---

## 🏗️ Project Structure

```
IBM_CareerCounselingAgent_Project/
│
├── app.py                      ← Flask backend + Watsonx API integration
├── agent_instructions.py       ← 🎛️ CUSTOMIZE THE AGENT HERE
├── requirements.txt            ← Python dependencies
├── .env.example                ← Template for environment variables
├── .env                        ← Your real credentials 
├── .gitignore                  ← Excludes .env, sessions, __pycache__
│
├── data/
│   └── labor_market_dataset.json  ← Curated labor market + industry trend data
│
├── templates/
│   └── index.html              ← Main SPA template (Flask Jinja2)
│
└── static/
    ├── css/
    │   └── style.css           ← All styles (dark mode, animations, responsive)
    └── js/
        └── app.js              ← All frontend logic (chat, charts, skills)
```

---

## 🚀 Quick Start

### 1. Clone / Navigate to project

```bash
cd IBM_CareerCounselingAgent_Project
```

### 2. Create a virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure IBM credentials

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
IBM_API_KEY=your_ibm_cloud_api_key_here
IBM_PROJECT_ID=your_watsonx_project_id_here
IBM_WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-3-3-8b-instruct
FLASK_SECRET_KEY=change_this_to_a_random_string
```

#### How to get IBM credentials:
1. Create a free account at [ibm.com/cloud](https://cloud.ibm.com)
2. Provision **IBM Watsonx.ai** from the catalog
3. In Watsonx.ai studio, create a **Project** and copy the **Project ID**
4. From IBM Cloud IAM, create an **API Key** with access to Watsonx.ai
5. Paste both values in your `.env` file

### 5. Run the application

```bash
python app.py
```

Open your browser at: **http://localhost:5000**

---

## 🎛️ Customizing the Agent

All agent behavior is controlled in **`agent_instructions.py`**. No prompt engineering required — just edit the plain-English constants:

```python
# Change the agent's name
AGENT_NAME = "Stride"

# Adjust the persona
AGENT_PERSONA = """
You are Stride, an empathetic career counselor...
"""

# Modify the tone guidelines
AGENT_TONE = """
- Use clear, jargon-free language...
"""

# Control the reasoning process (5-step chain)
AGENT_REASONING_PROCESS = """
STEP 1 — PROFILE SYNTHESIS: ...
STEP 2 — DATASET CROSS-REFERENCE: ...
"""

# Enforce honesty constraints
AGENT_HONESTY_CONSTRAINTS = """
1. DATA SOURCE TRANSPARENCY: Always cite sources...
2. NO FABRICATED STATISTICS: Never invent figures...
"""
```

---

## 📊 Updating the Dataset

The labor market data is stored in **`data/labor_market_dataset.json`**.

### Structure overview:

```json
{
  "metadata": { "version": "2025-Q1", "sources": [...] },
  "career_pathways": [
    {
      "id": "AI_ML_ENGINEER",
      "title": "AI / Machine Learning Engineer",
      "outlook": { "projected_growth_pct": 40, "median_annual_salary_usd": 136620, ... },
      "required_skills": { "technical": [...], "soft": [...] },
      "tags": ["AI", "ML", "Python", ...]
    }
  ],
  "industry_trends_2025": [ { "trend": "...", "impact": "...", "source": "..." } ],
  "academic_to_career_map": { "Computer Science": ["AI_ML_ENGINEER", ...] }
}
```

To add a new career pathway, copy an existing entry, change the `id` and all fields, then restart the server. The agent automatically picks up the new data.

---

## 🌐 Deployment

### Option A: Local / Development

```bash
python app.py
```

### Option B: Production with Gunicorn (Linux/macOS)

```bash
gunicorn -w 4 -b 0.0.0.0:5000 --timeout 120 app:app
```

### Option C: Docker

Create a `Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "120", "app:app"]
```

Build and run:

```bash
docker build -t stride-career-agent .
docker run -p 5000:5000 --env-file .env stride-career-agent
```

### Option D: IBM Code Engine (Recommended for IBM projects)

```bash
# Install IBM Cloud CLI + Code Engine plugin, then:
ibmcloud login
ibmcloud ce project create --name stride-career-agent
ibmcloud ce app create \
  --name stride-app \
  --image icr.io/your-namespace/stride-career-agent:latest \
  --env-from-secret stride-secrets \
  --port 5000
```

### Option E: Render / Railway / Heroku

Set all environment variables from `.env` in the platform's dashboard and deploy the repository.

---

## 🛡️ Security Notes

- **Never commit `.env`** to version control — it's in `.gitignore`
- Rotate your IBM API key regularly from the IBM Cloud IAM dashboard
- The `FLASK_SECRET_KEY` should be a long random string in production
- Session files are stored in `.flask_sessions/` — clear them periodically

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Main application UI |
| `POST` | `/api/session/start` | Initialize a new counseling session |
| `POST` | `/api/chat` | Send message, receive AI response |
| `GET` | `/api/dashboard/data` | Career pathways + trends data |
| `POST` | `/api/skills/assess` | Run skill gap analysis |
| `GET` | `/api/session/history` | Get conversation history |
| `POST` | `/api/session/clear` | Reset the session |
| `GET` | `/api/health` | Server + model health check |

---

## 📋 Dataset Sources

All statistics in `labor_market_dataset.json` are sourced from:

- 📄 **World Economic Forum** — Future of Jobs Report 2025
- 📄 **U.S. Bureau of Labor Statistics** — Occupational Outlook Handbook 2024-25
- 📄 **LinkedIn** — Jobs on the Rise 2024
- 📄 **Stack Overflow** — Developer Survey 2024
- 📄 **McKinsey Global Institute** — AI and the Future of Work 2024

> ⚠️ **Disclaimer:** This dataset is curated for demonstration/educational purposes. Always verify figures with official primary sources before making career or financial decisions.

---

## 🧪 Testing the Demo Mode

If you don't have IBM credentials yet, the app runs in **demo mode**:
- All UI tabs (Dashboard, Skills, Trends) work fully with the curated dataset
- The Chat UI shows a demo notice instead of real AI responses
- You can still test all skill assessments, career cards, and charts

---

## 📝 License

MIT License — Free for educational and personal use.

---

*Built with IBM Watsonx.ai · Flask · Bootstrap 5 · Llama LLM*
