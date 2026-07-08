"""
IBM AI Career Counseling Agent — Flask Backend
================================================
Powered by IBM Watsonx.ai with Granite models.
"""

import os
import json
import uuid
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, session, render_template, send_from_directory
from flask_session import Session
from dotenv import load_dotenv
from agent_instructions import build_system_prompt, AGENT_WELCOME_MESSAGE, AGENT_NAME

# ibm-watsonx-ai is imported lazily in get_watsonx_model() because it
# requires numpy/pandas which may not be available on Python pre-releases.

# ─── Load environment variables ──────────────────────────────────────────────
load_dotenv()

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# ─── Flask App Setup ─────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_FILE_DIR"] = ".flask_sessions"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=2)
Session(app)

# ─── Constants ───────────────────────────────────────────────────────────────
DATASET_PATH = os.path.join(os.path.dirname(__file__), "data", "labor_market_dataset.json")
IBM_API_KEY = os.getenv("IBM_API_KEY")
IBM_PROJECT_ID = os.getenv("IBM_PROJECT_ID")
IBM_WATSONX_URL = os.getenv("IBM_WATSONX_URL", "https://au-syd.ml.cloud.ibm.com")
WATSONX_MODEL_ID = os.getenv("WATSONX_MODEL_ID", "meta-llama/llama-3-3-70b-instruct")

MAX_TOKENS = 1800
MAX_HISTORY_TURNS = 10  # Keep last N conversation turns in context

# ─── Load Dataset ────────────────────────────────────────────────────────────
def load_dataset() -> dict:
    """Load the curated labor-market dataset from disk."""
    try:
        with open(DATASET_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("Dataset loaded: version %s", data["metadata"]["version"])
        return data
    except FileNotFoundError:
        logger.error("Dataset file not found at %s", DATASET_PATH)
        return {}
    except json.JSONDecodeError as e:
        logger.error("Dataset JSON parse error: %s", e)
        return {}


DATASET = load_dataset()


def build_dataset_summary(dataset: dict) -> str:
    """Serialise the dataset into a compact text summary for the LLM context."""
    if not dataset:
        return "No dataset available."

    lines = []
    meta = dataset.get("metadata", {})
    lines.append(f"Dataset Version: {meta.get('version', 'unknown')}")
    lines.append(f"Sources: {', '.join(meta.get('sources', []))}")
    lines.append("")

    lines.append("=== CAREER PATHWAYS ===")
    for cp in dataset.get("career_pathways", []):
        outlook = cp.get("outlook", {})
        tech_skills = cp.get("required_skills", {}).get("technical", [])
        lines.append(
            f"[{cp['id']}] {cp['title']} | Domain: {cp['domain']} | "
            f"Growth: {outlook.get('projected_growth_pct', 'N/A')}% ({outlook.get('growth_period', '')}) | "
            f"Median Salary: ${outlook.get('median_annual_salary_usd', 'N/A'):,} | "
            f"Demand: {outlook.get('demand_level', 'N/A')} | Source: {outlook.get('source', 'N/A')}"
        )
        lines.append(f"  Tags: {', '.join(cp.get('tags', []))}")
        lines.append(f"  Key Technical Skills: {', '.join(tech_skills[:5])}")
        lines.append(f"  Academia: {', '.join(cp.get('recommended_academics', []))}")
        lines.append(f"  Entry Roles: {', '.join(cp.get('entry_level_roles', []))}")
        lines.append(f"  Certifications: {', '.join(cp.get('certifications', []))}")
        lines.append("")

    lines.append("=== INDUSTRY TRENDS 2025 ===")
    for trend in dataset.get("industry_trends_2025", []):
        lines.append(f"• {trend['trend']}: {trend['impact']} (Source: {trend['source']})")

    lines.append("")
    lines.append("=== ACADEMIC → CAREER MAP ===")
    for acad, careers in dataset.get("academic_to_career_map", {}).items():
        lines.append(f"  {acad}: {', '.join(careers)}")

    return "\n".join(lines)


DATASET_SUMMARY = build_dataset_summary(DATASET)
DATASET_VERSION = DATASET.get("metadata", {}).get("version", "unknown")
SYSTEM_PROMPT = build_system_prompt(DATASET_SUMMARY, DATASET_VERSION)

# ─── Watsonx Model Initialisation ────────────────────────────────────────────
def get_watsonx_model():
    """Initialise and return a Watsonx ModelInference instance (lazy import)."""
    if not IBM_API_KEY or not IBM_PROJECT_ID:
        logger.warning("IBM credentials not configured. Running in demo mode.")
        return None
    try:
        from ibm_watsonx_ai import APIClient, Credentials
        from ibm_watsonx_ai.foundation_models import ModelInference
        from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

        credentials = Credentials(
            url=IBM_WATSONX_URL,
            api_key=IBM_API_KEY,
        )
        client = APIClient(credentials=credentials)
        model = ModelInference(
            model_id=WATSONX_MODEL_ID,
            api_client=client,
            project_id=IBM_PROJECT_ID,
            params={
                GenParams.DECODING_METHOD: "greedy",
                GenParams.MAX_NEW_TOKENS: MAX_TOKENS,
                GenParams.TEMPERATURE: 0.7,
                GenParams.REPETITION_PENALTY: 1.1,
                GenParams.STOP_SEQUENCES: ["<|endoftext|>", "Human:", "User:"],
            },
        )
        logger.info("Watsonx model initialised: %s", WATSONX_MODEL_ID)
        return model
    except ImportError as e:
        logger.error(
            "ibm-watsonx-ai import failed (likely missing numpy/pandas on this Python version): %s", e
        )
        logger.warning("Falling back to demo mode.")
        return None
    except Exception as e:
        logger.error("Failed to initialise Watsonx model: %s", e)
        return None


MODEL = get_watsonx_model()

# ─── Helpers ─────────────────────────────────────────────────────────────────
def format_conversation_for_granite(history: list, user_message: str) -> str:  # noqa: E302
    """
    Format the conversation history + new user message into Llama-3 chat format.
    Works for meta-llama/llama-3-x models on IBM Watsonx.ai.
    """
    parts = []
    parts.append("<|begin_of_text|>")
    parts.append(f"<|start_header_id|>system<|end_header_id|>\n\n{SYSTEM_PROMPT}<|eot_id|>")
    for turn in history[-MAX_HISTORY_TURNS:]:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        parts.append(f"<|start_header_id|>{role}<|end_header_id|>\n\n{content}<|eot_id|>")
    parts.append(f"<|start_header_id|>user<|end_header_id|>\n\n{user_message}<|eot_id|>")
    parts.append("<|start_header_id|>assistant<|end_header_id|>\n\n")
    return "".join(parts)


def demo_response(user_message: str) -> str:
    """Return a demo response when IBM credentials are not configured."""
    return (
        f"**[DEMO MODE — IBM credentials not configured]**\n\n"
        f"I received your message: *\"{user_message[:120]}...\"*\n\n"
        "To activate the full AI-powered counseling experience:\n"
        "1. Copy `.env.example` to `.env`\n"
        "2. Add your `IBM_API_KEY` and `IBM_PROJECT_ID`\n"
        "3. Restart the server\n\n"
        "The backend, dataset, and all UI components are fully operational. "
        "Only the AI inference step requires real IBM credentials."
    )


def get_career_pathways_for_dashboard() -> list:
    """Return career pathway data for the dashboard visualization."""
    pathways = []
    for cp in DATASET.get("career_pathways", []):
        outlook = cp.get("outlook", {})
        pathways.append({
            "id": cp["id"],
            "title": cp["title"],
            "domain": cp["domain"],
            "growth": outlook.get("projected_growth_pct", 0),
            "salary": outlook.get("median_annual_salary_usd", 0),
            "demand": outlook.get("demand_level", "Unknown"),
            "tags": cp.get("tags", []),
            "description": cp.get("description", ""),
        })
    return pathways


# ─── Routes ──────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    """Serve the main SPA page."""
    return render_template("index.html", agent_name=AGENT_NAME)


@app.route("/api/session/start", methods=["POST"])
def start_session():
    """Initialise or reset a counseling session."""
    session["conversation_id"] = str(uuid.uuid4())
    session["history"] = []
    session["student_profile"] = {}
    session["recommendations"] = []
    session["session_started"] = datetime.utcnow().isoformat()
    return jsonify({
        "status": "ok",
        "conversation_id": session["conversation_id"],
        "welcome_message": AGENT_WELCOME_MESSAGE.strip(),
        "agent_name": AGENT_NAME,
    })


@app.route("/api/chat", methods=["POST"])
def chat():
    """Main chat endpoint — receives user message, returns AI response."""
    data = request.get_json(silent=True)
    if not data or "message" not in data:
        return jsonify({"error": "Missing 'message' field."}), 400

    user_message = data["message"].strip()
    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400
    if len(user_message) > 4000:
        return jsonify({"error": "Message too long (max 4000 characters)."}), 400

    # Initialise session if needed
    if "history" not in session:
        session["history"] = []
        session["conversation_id"] = str(uuid.uuid4())

    history = session.get("history", [])

    # ── Call the model ──────────────────────────────────────────────────────
    try:
        if MODEL:
            prompt = format_conversation_for_granite(history, user_message)
            response = MODEL.generate_text(prompt=prompt)
            assistant_reply = response.strip() if isinstance(response, str) else str(response)
        else:
            assistant_reply = demo_response(user_message)
    except Exception as e:
        logger.error("Model inference error: %s", e)
        assistant_reply = (
            "I encountered a temporary issue processing your request. "
            "Please try again in a moment. If the problem persists, check your IBM credentials."
        )

    # ── Update history ──────────────────────────────────────────────────────
    history.append({"role": "user", "content": user_message, "timestamp": datetime.utcnow().isoformat()})
    history.append({"role": "assistant", "content": assistant_reply, "timestamp": datetime.utcnow().isoformat()})
    session["history"] = history[-MAX_HISTORY_TURNS * 2:]  # Trim to avoid bloat

    return jsonify({
        "status": "ok",
        "reply": assistant_reply,
        "conversation_id": session.get("conversation_id"),
        "turn": len(history) // 2,
    })


@app.route("/api/dashboard/data", methods=["GET"])
def dashboard_data():
    """Return career pathway data for the interactive dashboard."""
    return jsonify({
        "career_pathways": get_career_pathways_for_dashboard(),
        "industry_trends": DATASET.get("industry_trends_2025", []),
        "dataset_version": DATASET_VERSION,
        "skill_categories": DATASET.get("skill_categories", {}),
    })


@app.route("/api/skills/assess", methods=["POST"])
def assess_skills():
    """
    Accept a student's skill self-assessment and return a gap analysis
    against a specified career pathway.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "No data provided."}), 400

    student_skills = [s.lower() for s in data.get("skills", [])]
    target_pathway_id = data.get("pathway_id", "")

    pathway = next(
        (p for p in DATASET.get("career_pathways", []) if p["id"] == target_pathway_id),
        None
    )
    if not pathway:
        return jsonify({"error": f"Pathway '{target_pathway_id}' not found."}), 404

    required_tech = pathway["required_skills"]["technical"]
    required_soft = pathway["required_skills"]["soft"]
    all_required = required_tech + required_soft

    matched = [s for s in all_required if any(sk in s.lower() for sk in student_skills)]
    missing = [s for s in all_required if not any(sk in s.lower() for sk in student_skills)]
    match_pct = round(len(matched) / len(all_required) * 100) if all_required else 0

    return jsonify({
        "pathway_id": target_pathway_id,
        "pathway_title": pathway["title"],
        "match_percentage": match_pct,
        "matched_skills": matched,
        "missing_skills": missing,
        "certifications": pathway.get("certifications", []),
        "entry_roles": pathway.get("entry_level_roles", []),
    })


@app.route("/api/session/history", methods=["GET"])
def get_history():
    """Return the current session's conversation history."""
    return jsonify({
        "history": session.get("history", []),
        "conversation_id": session.get("conversation_id"),
    })


@app.route("/api/session/clear", methods=["POST"])
def clear_session():
    """Clear the current session and start fresh."""
    session.clear()
    return jsonify({"status": "cleared"})


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "model": WATSONX_MODEL_ID,
        "model_ready": MODEL is not None,
        "dataset_version": DATASET_VERSION,
        "dataset_pathways": len(DATASET.get("career_pathways", [])),
        "timestamp": datetime.utcnow().isoformat(),
    })


# ─── Run ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 8080))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    logger.info("Starting IBM Career Counseling Agent on port %d", port)
    app.run(host="127.0.0.1", port=port, debug=debug, use_reloader=False)
