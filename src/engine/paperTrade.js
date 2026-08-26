const db = require('../db/db');

// Fungsi pembantu untuk cek saldo di wallet
function getBalance(asset) {
    const row = db.prepare('SELECT balance FROM wallet WHERE asset = ?').get(asset);
    return row ? row.balance : 0;
}

// Fungsi eksekusi BUY (Entry Signal)
function executeDummyBuy(pair, currentPrice, usdtAmount, targetTp, targetSl) {
    const coin = pair.split('/')[0]; // Ekstrak "BTC" dari "BTC/USDT"

    // 1. Validasi Saldo
    const usdtBalance = getBalance('USDT');
    if (usdtBalance < usdtAmount) {
        console.log(`[REJECTED] Saldo USDT tidak cukup. Saldo: ${usdtBalance}, Butuh: ${usdtAmount}`);
        return false;
    }

    // 2. Kalkulasi koin yang didapat & potong fee simulasi (0.1%)
    const feeRate = 0.001;
    const amountBought = usdtAmount / currentPrice;
    const finalCoinAmount = amountBought * (1 - feeRate);

    // 3. Gunakan DB Transaction (Kalau satu gagal, semua dibatalkan biar data nggak korup)
    const transaction = db.transaction(() => {
        // Kurangi saldo USDT
        db.prepare('UPDATE wallet SET balance = balance - ? WHERE asset = ?').run(usdtAmount, 'USDT');

        // Tambah saldo Koin (BTC)
        const checkCoin = db.prepare('SELECT * FROM wallet WHERE asset = ?').get(coin);
        if (checkCoin) {
            db.prepare('UPDATE wallet SET balance = balance + ? WHERE asset = ?').run(finalCoinAmount, coin);
        } else {
            db.prepare('INSERT INTO wallet (asset, balance) VALUES (?, ?)').run(coin, finalCoinAmount);
        }

        // Catat posisi baru ke tabel active_positions dengan status OPEN
        const insertPosition = db.prepare(`
            INSERT INTO active_positions (pair, buy_price, amount_coin, target_tp, target_sl, status, entry_time)
            VALUES (?, ?, ?, ?, ?, 'OPEN', datetime('now', 'localtime'))
        `);
        insertPosition.run(pair, currentPrice, finalCoinAmount, targetTp, targetSl);
    });

    try {
        transaction();
        console.log(`[BUY SUCCESS] ${pair} | Price: ${currentPrice} | Target TP: ${targetTp} | Target SL: ${targetSl}`);
        return true;
    } catch (error) {
        console.error(`[BUY FAILED] Database error: ${error.message}`);
        return false;
    }
}

// Fungsi eksekusi SELL (Hit TP atau SL)
function executeDummySell(positionId, currentPrice, closeReason) {
    // Ambil data posisi yang mau ditutup
    const position = db.prepare('SELECT * FROM active_positions WHERE id = ? AND status = ?').get(positionId, 'OPEN');

    if (!position) {
        console.log(`[SELL REJECTED] Posisi ID ${positionId} tidak ditemukan atau sudah ditutup.`);
        return false;
    }

    const pair = position.pair;
    const coin = pair.split('/')[0];
    const amountCoin = position.amount_coin;
    const buyPrice = position.buy_price;

    // 1. Validasi saldo koin
    const coinBalance = getBalance(coin);
    if (coinBalance < amountCoin) {
        console.log(`[SELL REJECTED] Saldo ${coin} tidak cukup untuk menutup posisi.`);
        return false;
    }

    // 2. Kalkulasi nilai jual & potong fee simulasi (0.1%)
    const feeRate = 0.001;
    const grossUsdt = amountCoin * currentPrice;
    const netUsdt = grossUsdt * (1 - feeRate);

    // Kalkulasi Profit and Loss (PnL)
    const initialInvestment = amountCoin * buyPrice;
    const profitLoss = netUsdt - initialInvestment;

    // 3. Eksekusi DB Transaction
    const transaction = db.transaction(() => {
        // Kurangi saldo Koin
        db.prepare('UPDATE wallet SET balance = balance - ? WHERE asset = ?').run(amountCoin, coin);

        // Tambah saldo USDT
        db.prepare('UPDATE wallet SET balance = balance + ? WHERE asset = ?').run(netUsdt, 'USDT');

        // Update status active_positions jadi CLOSED
        db.prepare('UPDATE active_positions SET status = ? WHERE id = ?').run('CLOSED', positionId);

        // Masukkan log ke trade_history (open_time dibawa dari entry posisi)
        const insertHistory = db.prepare(`
            INSERT INTO trade_history (pair, buy_price, sell_price, profit_loss, close_reason, timestamp, open_time)
            VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
        `);
        insertHistory.run(pair, buyPrice, currentPrice, profitLoss, closeReason, position.entry_time || null);
    });

    try {
        transaction();
        console.log(`[SELL SUCCESS] ${pair} | Reason: ${closeReason} | Sell: ${currentPrice} | PnL: ${profitLoss.toFixed(4)} USDT`);
        return true;
    } catch (error) {
        console.error(`[SELL FAILED] Database error: ${error.message}`);
        return false;
    }
}

module.exports = {
    getBalance,
    executeDummyBuy,
    executeDummySell
};
