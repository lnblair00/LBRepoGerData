import sys
import os
import threading
import webbrowser
import time
import requests
import secrets
from flask import Flask, render_template, request, redirect, url_for, session
from datetime import datetime, timezone

LAST_SEEN_UTC = datetime.now(timezone.utc)

# ==========================================================
# RESOURCE PATH (PyInstaller support) - FIXED
# ==========================================================
def resource_path(relative: str) -> str:
    """
    Returns an absolute path to a resource.
    - In PyInstaller, resources live under sys._MEIPASS
    - In normal python execution, resources should resolve relative to this file (app.py)
    """
    try:
        base = sys._MEIPASS  # type: ignore[attr-defined]
    except Exception:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative)


# ==========================================================
# PASSWORD (LIVE FROM GITHUB ONLY — NO CACHING)
# ==========================================================
PASSWORD_URL = "https://raw.githubusercontent.com/lnblair00/Packing-Slips/main/boring.txt"


def fetch_live_password():
    """Fetch password directly from GitHub with cache prevention."""
    try:
        url = f"{PASSWORD_URL}?t={int(time.time())}"
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            pw = resp.text.strip()
            if pw:
                return pw
    except Exception:
        pass
    return None


def get_current_password():
    return fetch_live_password()


# ==========================================================
# FLASK APP INITIALISATION - FIXED
# ==========================================================
app = Flask(
    __name__,
    template_folder=resource_path("templates"),
    static_folder=resource_path("static"),
)

# Optional: uncomment for one run to verify the paths being used
# print("TEMPLATE FOLDER:", app.template_folder)
# print("STATIC FOLDER:", app.static_folder)
# print("LOGIN EXISTS?:", os.path.exists(os.path.join(app.template_folder, "login.html")))

app.secret_key = secrets.token_hex(32)


@app.before_request
def update_last_seen():
    global LAST_SEEN_UTC
    LAST_SEEN_UTC = datetime.now(timezone.utc)


def is_logged_in():
    return session.get("logged_in", False)


# ==========================================================
# USER ACTIVITY MONITOR
# ==========================================================
def update_activity():
    session["last_seen"] = time.time()


def inactivity_watchdog(timeout_seconds=300):
    """
    Shuts down the server after 'timeout_seconds' with no HTTP requests.
    SAFE: does not touch Flask session/request context.
    """
    global LAST_SEEN_UTC
    while True:
        time.sleep(5)
        idle = (datetime.now(timezone.utc) - LAST_SEEN_UTC).total_seconds()
        if idle >= timeout_seconds:
            try:
                requests.post("http://127.0.0.1:5000/__shutdown__", timeout=2)
            except Exception:
                pass
            break


# ==========================================================
# ROUTES
# ==========================================================
@app.route("/")
def index():
    return render_template("login.html", error=None)


@app.route("/login", methods=["POST"])
def login():
    input_pw = request.form.get("password", "").strip()
    actual_pw = get_current_password()

    if actual_pw is None:
        return render_template(
            "login.html",
            error="Cannot reach password server. Internet connection is required.",
        )

    if input_pw == actual_pw:
        session["logged_in"] = True
        update_activity()
        return redirect(url_for("map_view"))
    else:
        return render_template("login.html", error="Incorrect password.")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/map")
def map_view():
    if not is_logged_in():
        return redirect(url_for("index"))
    update_activity()
    return render_template("map.html")


# ==========================================================
# END SESSION BUTTON — FORCE EXIT
# ==========================================================
@app.route("/force_exit", methods=["POST"])
def force_exit():
    shutdown_server()
    return "Exiting..."


# ==========================================================
# AUTO-CLOSE SERVER WHEN BROWSER GONE
# ==========================================================
@app.route("/__ping__")
def ping():
    return "ok"


def shutdown_server():
    func = request.environ.get("werkzeug.server.shutdown")
    if func:
        func()


@app.route("/__shutdown__", methods=["POST"])
def shutdown():
    shutdown_server()
    return "Server shutting down..."


def monitor_browser():
    """Heartbeat loop."""
    time.sleep(3)  # Allow server startup
    while True:
        try:
            requests.get("http://127.0.0.1:5000/__ping__", timeout=1)
        except Exception:
            try:
                requests.post("http://127.0.0.1:5000/__shutdown__", timeout=1)
            except Exception:
                pass
            break
        time.sleep(2)


# ==========================================================
# ENTRY POINT
# ==========================================================
if __name__ == "__main__":

    def open_new_window():
        webbrowser.open("http://127.0.0.1:5000", new=1)


        # Edge fallback
        os.system('start msedge --new-window "http://127.0.0.1:5000"')

    threading.Timer(1.0, open_new_window).start()

    # Start inactivity watchdog
    threading.Thread(target=lambda: inactivity_watchdog(300), daemon=True).start()

    # Start browser monitor (FIXED: this was previously starting the watchdog twice)
    threading.Thread(target=monitor_browser, daemon=True).start()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        use_reloader=False,
    )

    os._exit(0)
