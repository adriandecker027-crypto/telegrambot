# telegrambot

A lightweight Telegram bot that monitors EVM-compatible wallet balances and sends notifications when an account's net worth (USD) changes.

Features
- Multi-wallet monitoring: add, remove, and list wallets to monitor via Telegram commands
- USD net-worth tracking using DeBank API (falls back to token list when needed)
- Notifications on balance changes with dollar and percent delta
- Commands: `/addwallet`, `/removewallet`, `/listwallet`, `/balance [address]`, `/status`, `/help`
- Simple persistence (wallets saved to `wallets.json`)

Quickstart
1. Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and optionally `EVM_ADDRESS`.
2. Install dependencies: `npm install` (and ensure Python script `fetch_balance.py` is available if used).
3. Run: `node index.js`.

Notes
- The bot queries external APIs (DeBank or a local Python fetcher). Ensure you have any required API keys and respect provider rate limits.
- Wallets are stored in `wallets.json` in the project root.

Contributing
Feel free to open issues or pull requests to add features such as per-wallet chain selection, persistence to a database, or per-wallet notification thresholds.

License
MIT