require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuration
const token = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const chatId = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID';
const ankrApiUrl = 'https://rpc.ankr.com/multichain';
const blockchainId = process.env.BLOCKCHAIN_ID || 'eth'; // 'eth', 'bsc', 'polygon', etc.

// Multi-wallet storage
const wallets = {}; // Format: { address: { chain: 'eth', lastBalance: '0' } }

// Load initial wallets from environment or use defaults
function initializeWallets() {
  const initialAddress = process.env.EVM_ADDRESS;
  if (initialAddress && initialAddress !== 'YOUR_EVM_ADDRESS') {
    wallets[initialAddress] = {
      chain: blockchainId,
      lastBalance: null
    };
  }
}

// Create a bot that uses polling to fetch new updates
const bot = new TelegramBot(token, { polling: true });

/**
 * Get EVM account balance using Ankr Token API
 * @param {string} address - EVM wallet address
 * @param {string} chain - Blockchain ID (eth, bsc, polygon, etc.)
 * @returns {Promise<Object>} Balance information with assets array
 */
async function getAccountBalance(address, chain) {
  try {
    const response = await axios.post(ankrApiUrl, {
      jsonrpc: '2.0',
      method: 'ankr_getAccountBalance',
      params: {
        blockchain: chain,
        walletAddress: address
      },
      id: 1
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching balance from Ankr API:', error.message);
    throw error;
  }
}

/**
 * Extract native token balance from Ankr API response
 * @param {Object} balanceData - Balance data from Ankr API
 * @returns {string} Native token balance
 */
function getNativeTokenBalance(balanceData) {
  if (!balanceData || !balanceData.assets || balanceData.assets.length === 0) {
    return '0';
  }

  // Find the native token (first asset is usually native token)
  const nativeAsset = balanceData.assets.find(asset => asset.contractAddress === null);
  
  if (nativeAsset && nativeAsset.balance) {
    return nativeAsset.balance;
  }

  // Fallback to first asset if native not found
  return balanceData.assets[0].balance || '0';
}

/**
 * Get USD value of account
 * @param {Object} balanceData - Balance data from Ankr API
 * @returns {string} Total balance in USD
 */
function getUSDBalance(balanceData) {
  if (!balanceData || !balanceData.totalBalanceUsd) {
    return '0';
  }
  return balanceData.totalBalanceUsd;
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
      const balanceData = await getAccountBalance(address, walletInfo.chain);
      const currentBalance = getNativeTokenBalance(balanceData);
      const currentUSD = getUSDBalance(balanceData);
      const assetCount = balanceData.assets ? balanceData.assets.length : 0;

      if (walletInfo.lastBalance !== null && currentBalance !== walletInfo.lastBalance) {
        const balanceChangeText = parseFloat(currentBalance) > parseFloat(walletInfo.lastBalance) 
          ? '📈 Increased' 
          : '📉 Decreased';
        
        const message = `${balanceChangeText} - Wallet balance changed!\n` +
                        `Blockchain: ${walletInfo.chain.toUpperCase()}\n` +
                        `Address: ${address.substring(0, 10)}...${address.substring(address.length - 8)}\n` +
                        `Previous: ${walletInfo.lastBalance}\n` +
                        `Current: ${currentBalance}\n` +
                        `USD Value: $${currentUSD}\n` +
                        `Total Assets: ${assetCount}\n` +
                        `Timestamp: ${new Date().toLocaleString()}`;
        
        await bot.sendMessage(chatId, message);
        console.log('Notification sent:', message);
      } else if (walletInfo.lastBalance === null) {
        console.log(`Initial balance retrieved for ${address.substring(0, 10)}...: ${currentBalance}`);
      }

      walletInfo.lastBalance = currentBalance;
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
  console.log(`⛓️ Default Blockchain: ${blockchainId}`);
  console.log(`⏱️ Check interval: 30 seconds\n`);
  
  // Perform initial check
  await checkBalance();
  
  // Check balance every 30 seconds (adjust as needed)
  setInterval(checkBalance, 30000);
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
    '/status - Check monitoring status\n' +
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
        const walletInfo = wallets[address];
        const balanceData = await getAccountBalance(address, walletInfo.chain);
        const balance = getNativeTokenBalance(balanceData);
        const usdValue = getUSDBalance(balanceData);
        const assetCount = balanceData.assets ? balanceData.assets.length : 0;
        
        response += `📍 ${address.substring(0, 10)}...${address.substring(address.length - 8)}\n`;
        response += `Chain: ${walletInfo.chain.toUpperCase()}\n`;
        response += `Balance: ${balance}\n`;
        response += `USD: $${usdValue}\n`;
        response += `Assets: ${assetCount}\n\n`;
      } catch (error) {
        response += `📍 ${address.substring(0, 10)}...\n❌ Error: ${error.message}\n\n`;
      }
    }
    
    bot.sendMessage(chatIdFromMsg, response);
  } catch (error) {
    bot.sendMessage(chatIdFromMsg, `❌ Error fetching balance: ${error.message}`);
  }
});

// Bot command: /status
bot.onText(/\/status/, (msg) => {
  const chatIdFromMsg = msg.chat.id;
  const walletCount = Object.keys(wallets).length;
  let statusMsg = `✅ Bot Status: Running\n\n`;
  statusMsg += `📊 Monitored Wallets: ${walletCount}\n`;
  statusMsg += `⛓️ Default Chain: ${blockchainId}\n`;
  statusMsg += `⏱️ Check Interval: 30 seconds\n\n`;
  
  if (walletCount > 0) {
    statusMsg += 'Wallets:\n';
    Object.entries(wallets).forEach(([addr, info]) => {
      statusMsg += `• ${addr.substring(0, 10)}... (${info.chain}) - Balance: ${info.lastBalance || 'pending'}\n`;
    });
  } else {
    statusMsg += '❌ No wallets monitored yet.\n';
  }
  
  bot.sendMessage(chatIdFromMsg, statusMsg);
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
    await getAccountBalance(address, blockchainId);
    
    wallets[address] = {
      chain: blockchainId,
      lastBalance: null
    };
    
    bot.sendMessage(chatIdFromMsg, `✅ Wallet added!\n${address}\nChain: ${blockchainId}`);
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
    response += `${idx + 1}. ${addr}\n   Chain: ${wallets[addr].chain}\n\n`;
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
    '/status - Bot status\n' +
    '/start - Welcome message\n' +
    '/help - This message'
  );
});

// Start monitoring
initializeMonitoring();
