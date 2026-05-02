# HH Agent

## Browser helper for manual HH responses

HH does not provide a reliable applicant API for real responses and chats, so
the low-risk MVP uses a real browser session.

The helper opens HH, reuses a saved browser profile, prepares the response, and
stops before the final submit button. The final send action stays manual.

### Setup

```bash
cd agents/hh
python -m pip install -r requirements.txt
python -m pip install -r requirements-browser.txt
python -m playwright install chromium
```

### First login

Run the command below once. A browser opens; log in to HH manually. The session
is saved in `agents/hh/.browser/hh`.

```bash
python browser_agent.py prepare_apply --vacancy-id 131810308 --profile-id 2
```

### Prepare a response

```bash
python browser_agent.py prepare_apply --vacancy-id <HH_VACANCY_ID> --profile-id <LOCAL_PROFILE_ID>
```

If HH shows several resumes, pass the visible resume title:

```bash
python browser_agent.py prepare_apply \
  --vacancy-id <HH_VACANCY_ID> \
  --profile-id <LOCAL_PROFILE_ID> \
  --hh-resume-title "AI Automation / Systems Specialist"
```

The script:

1. Generates a cover letter from the local vacancy and resume profile.
2. Opens the vacancy on HH.
3. Clicks the response flow when possible.
4. Selects the HH resume if `--hh-resume-title` is provided.
5. Inserts the cover letter into the response form.
6. Waits while you review and submit manually.

If HH shows captcha, SMS, login, resume mismatch, or any unusual step, handle it
manually in the opened browser. The script intentionally does not bypass checks
and does not press the final submit button.
