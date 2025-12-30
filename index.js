require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { execSync } = require('child_process');

// Configuration
const token = process.env.TELEGRAM_BOT_TOKEN || '8242352167:AAGAOZMDNdhhrDSPg7hxvjJyZXrbvo474ZI';
const chatId = process.env.TELEGRAM_CHAT_ID || '7760381935';

// Multi-wallet storage
const wallets = {}; // Format: { address: { chain: 'eth', lastUsd: 0 } }

// Load initial wallets from environment or use defaults
function initializeWallets() {
  try {
    const storedWallets = fs.readFileSync('wallets.json', 'utf8');
    Object.assign(wallets, JSON.parse(storedWallets));
  } catch (err) {
    console.log('No existing wallets.json found, starting fresh.');
  }
}

// Create a bot that uses polling to fetch new updates
const bot = new TelegramBot(token, { polling: true });

/**
 * Get EVM account balance using Python camousfox script
 * @param {string} address - EVM wallet address
 * @returns {string} Balance information
 */
function getAccountBalance(address) {
  try {
    let balance = execSync('python fetch_balance.py ' + address);
    return balance.toString().trim().replace('$', '');
  } catch (error) {
    throw new Error(`Failed to fetch balance for ${address}: ${error.message}`);
  }
}

/**
 * Check balance for all monitored wallets and notify if changed
 */
async function checkBalance() {
  const addresses = Object.keys(wallets);
  
  if (addresses.length === 0) {
    console.log('No wallets to monitor. Add wallets with /addwallet <address>');
    return;
  }

  for (const address of addresses) {
    try {
      const walletInfo = wallets[address];
      const balance = getAccountBalance(address);
      const currentUSD = parseFloat(balance);
      if (walletInfo.lastUsd !== null && walletInfo.lastUsd !== undefined) {
        if (parseFloat(balance) !== parseFloat(walletInfo.lastUsd)) {

          const increased = currentUSD > walletInfo.lastUsd;
          const diff = Math.abs(currentUSD - walletInfo.lastUsd);
          const pct = ((diff / walletInfo.lastUsd) * 100).toFixed(2);

          const message = `${increased ? '📈 Increased' : '📉 Decreased'} - Wallet net worth changed!\n` +
                          `Address: ${address}\n` +
                          `Previous (USD): $${Number(walletInfo.lastUsd).toFixed(2)}\n` +
                          `Current (USD): $${currentUSD.toFixed(2)}\n` +
                          `Change: $${diff} (${pct}%)\n` +
                          `Timestamp: ${new Date().toLocaleString()}`;

          await bot.sendMessage(chatId, message);
          console.log('Notification sent:', message);
        }
      } else {
        console.log(`Initial USD balance retrieved for ${address}: $${currentUSD.toFixed(2)}`);
      }

      walletInfo.lastUsd = currentUSD;
    } catch (error) {
      console.error(`Error checking balance for ${address}:`, error.message);
    }
  }
}

/**
 * Initialize balance monitoring
 */
async function initializeMonitoring() {
  initializeWallets();
  
  console.log('🤖 Telegram Bot started!');
  console.log(`📊 Monitoring ${Object.keys(wallets).length} wallet(s)`);
  console.log(`⏱️ Check interval: 30 seconds\n`);
  
  // Perform initial check
  await checkBalance();
  
  // Check balance every 30 seconds (adjust as needed)
  setInterval(checkBalance, 300000);
}

// Bot command: /start
bot.onText(/\/start/, (msg) => {
  const chatIdFromMsg = msg.chat.id;
  bot.sendMessage(chatIdFromMsg, 
    '👋 Welcome to EVM Balance Monitor Bot!\n\n' +
    'Wallet Management:\n' +
    '/addwallet <address> - Add wallet to monitor\n' +
    '/removewallet <address> - Remove wallet from monitoring\n' +
    '/listwallet - List all monitored wallets\n\n' +
    'Commands:\n' +
    '/balance [address] - Get wallet balance (all if no address)\n' +
    '/help - Show this message'
  );
});

// Bot command: /balance [address]
bot.onText(/\/balance(?:\s+(.+))?/, async (msg, match) => {
  const chatIdFromMsg = msg.chat.id;
  const specifiedAddress = match[1] ? match[1].trim().toLowerCase() : null;
  
  try {
    let addresses = [];
    
    if (specifiedAddress) {
      const found = Object.keys(wallets).find(addr => addr.toLowerCase() === specifiedAddress);
      if (found) {
        addresses = [found];
      } else {
        bot.sendMessage(chatIdFromMsg, `❌ Wallet not found. Use /listwallet to see monitored wallets.`);
        return;
      }
    } else {
      addresses = Object.keys(wallets);
    }
    
    if (addresses.length === 0) {
      bot.sendMessage(chatIdFromMsg, '❌ No wallets to check. Use /addwallet <address> to add one.');
      return;
    }
    
    let response = '💰 Wallet Balances\n\n';
    
    for (const address of addresses) {
      try {
        const balance = getAccountBalance(address);

        response += `📍 ${address.substring(0, 10)}...${address.substring(address.length - 8)}\n`;
        response += `USD (total): $${Number(balance).toFixed(2)}\n`;
      } catch (error) {
        response += `📍 ${address.substring(0, 10)}...\n❌ Error: ${error.message}\n\n`;
      }
    }
    
    bot.sendMessage(chatIdFromMsg, response);
  } catch (error) {
    bot.sendMessage(chatIdFromMsg, `❌ Error fetching balance: ${error.message}`);
  }
});

// Bot command: /addwallet <address>
bot.onText(/\/addwallet\s+(.+)/, async (msg, match) => {
  const chatIdFromMsg = msg.chat.id;
  const address = match[1].trim().toLowerCase();
  
  if (!/^0x[a-f0-9]{40}$/i.test(address)) {
    bot.sendMessage(chatIdFromMsg, '❌ Invalid Ethereum address format.');
    return;
  }
  
  if (wallets[address]) {
    bot.sendMessage(chatIdFromMsg, '⚠️ This wallet is already being monitored.');
    return;
  }
  
  try {
    let balance = getAccountBalance(address);

    wallets[address] = {
      lastUsd: balance
    };
    //add wallet address into file or database here
    fs.writeFileSync('wallets.json', '{}');
    const walletData = JSON.stringify(wallets, null, 2);
    fs.writeFileSync('wallets.json', walletData);

    bot.sendMessage(chatIdFromMsg, `✅ Wallet added!\n${address}`);
    console.log(`Wallet added: ${address}`);
  } catch (error) {
    bot.sendMessage(chatIdFromMsg, `❌ Error adding wallet: ${error.message}`);
  }
});

// Bot command: /removewallet <address>
bot.onText(/\/removewallet\s+(.+)/, (msg, match) => {
  const chatIdFromMsg = msg.chat.id;
  const address = match[1].trim().toLowerCase();
  const found = Object.keys(wallets).find(addr => addr.toLowerCase() === address);
  
  if (found) {
    delete wallets[found];

    fs.writeFileSync('wallets.json', '{}');
    const walletData = JSON.stringify(wallets, null, 2);
    fs.writeFileSync('wallets.json', walletData);

    bot.sendMessage(chatIdFromMsg, `✅ Wallet removed!\n${found}`);
    console.log(`Wallet removed: ${found}`);
  } else {
    bot.sendMessage(chatIdFromMsg, `❌ Wallet not found. Use /listwallet to see all wallets.`);
  }
});

// Bot command: /listwallet
bot.onText(/\/listwallet/, (msg) => {
  const chatIdFromMsg = msg.chat.id;
  const addresses = Object.keys(wallets);
  
  if (addresses.length === 0) {
    bot.sendMessage(chatIdFromMsg, '❌ No wallets monitored yet.\nUse /addwallet <address> to add one.');
    return;
  }
  
  let response = `📋 Monitored Wallets (${addresses.length}):\n\n`;
  addresses.forEach((addr, idx) => {
    response += `${idx + 1}. ${addr}\n`;
  });
  
  bot.sendMessage(chatIdFromMsg, response);
});

// Bot command: /help
bot.onText(/\/help/, (msg) => {
  const chatIdFromMsg = msg.chat.id;
  bot.sendMessage(chatIdFromMsg, 
    '📖 Available Commands:\n\n' +
    '🔧 Wallet Management:\n' +
    '/addwallet <address> - Add wallet\n' +
    '/removewallet <address> - Remove wallet\n' +
    '/listwallet - List all wallets\n\n' +
    '📊 Queries:\n' +
    '/balance [address] - Get balance(s)\n' +
    '/start - Welcome message\n' +
    '/help - This message'
  );
});

// Start monitoring
initializeMonitoring();
