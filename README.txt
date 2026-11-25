PAYOPS AI Copilot - source code
IDS 517 final project (individual): Tanjiba Sultana

HOW TO RUN
  Option A (folder): first EXTRACT the zip (right-click > Extract All). Then open the extracted
    PayOps_AI_Copilot_Source_Code folder and double-click index.html (Chrome or Edge).
    Opening index.html straight from inside the zip shows an unstyled page, because
    Windows copies only that one file and leaves styles.css and js/ behind.
  Option B (one file): double-click PayOps_AI_Copilot_OneFile.html. It is the same app with
    the CSS and JavaScript inside one file, so it works even without extracting.
  No installation needed.
  Choose a demo user on the sign-in screen (demo sign-in; "Switch user" changes person).
  Sign in as a manager, then on Ledger click "Load sample business day".
  Self-test > "Run all tests" runs the 50 automated checks.
  AI features, the Google Drive connector (MCP), Claude-account sign-in, "Preview as role"
  and the shared team database run through claude.ai and are shown in the class demo;
  opened from this folder they are switched off and everything else works.

FILES (loaded in this order by index.html; all written by Tanjiba Sultana)
  PayOps_AI_Copilot_OneFile.html  Same app as one self-contained file (demo copy)
  js/01-core.js               Helpers, saved state, append-only audit log
  js/02-signin-roles.js       Sign-in, roles, preview, maker-checker, shared DB
  js/03-m1-rules-engine.js    Validation, fees, risk, refunds, sample day
  js/04-ai-gateway.js         Connection to Claude; read-only AI tools
  js/05-m2-fraud-copilot.js   Review queue, AI copilot, Reopen, triage agent
  js/06-m3-dashboard.js       Totals, AI day summary
  js/07-m4-disputes.js        Reason code, playbook, draft, escalate
  js/08-ui-rendering.js       Draws every screen
  js/09-screen-events.js      Button actions for each screen
  js/10-google-drive-mcp.js   Google Drive connector (MCP): evidence, reports
  js/11-ops-chat.js           Claude assistant with ledger tools
  js/12-self-test.js          50 automated checks
  js/13-ai-evaluation.js      Automated AI evaluation (FR-20)
  js/14-app.js                Screen routing and start-up
Code was generated with Claude, then reviewed, tested and explained by me (Tanjiba Sultana).
