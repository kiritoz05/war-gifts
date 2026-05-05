const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(express.static('public'));

let tiktokConnection = null;

io.on('connection', (socket) => {
  console.log('🎮 Juego conectado');

  // Cliente pide conectar a TikTok
  socket.on('connect-tiktok', async (username) => {
    // Desconectar si ya había una conexión
    if (tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch(e) {}
      tiktokConnection = null;
    }

    const user = username.replace('@', '').trim();
    console.log(`Conectando a @${user}...`);

    tiktokConnection = new WebcastPushConnection(user, {
      processInitialData: false,
      enableExtendedGiftInfo: true,
      enableWebsocketUpgrade: true,
      requestPollingIntervalMs: 2000,
    });

    try {
      const state = await tiktokConnection.connect();
      console.log(`✅ Conectado a @${user}`);
      socket.emit('tiktok-status', { ok: true, user });

      // 🎁 REGALOS EN TIEMPO REAL
      tiktokConnection.on('gift', (data) => {
        // Solo regalos completos (no los que están en racha sin terminar)
        if (data.giftType === 1 && !data.repeatEnd) return;

        const gift = {
          user:     data.uniqueId,
          nickname: data.nickname,
          gift:     data.giftName,
          coins:    data.diamondCount * (data.repeatCount || 1),
          count:    data.repeatCount || 1,
          giftId:   data.giftId,
        };

        console.log(`🎁 ${gift.nickname} → ${gift.gift} x${gift.count} (${gift.coins} 🪙)`);
        io.emit('gift', gift);
      });

      // Errores de conexión
      tiktokConnection.on('error', (err) => {
        console.error('Error TikTok:', err);
        socket.emit('tiktok-status', { ok: false, error: err.message });
      });

      tiktokConnection.on('disconnected', () => {
        console.log('TikTok desconectado');
        socket.emit('tiktok-status', { ok: false, error: 'Desconectado' });
      });

    } catch (err) {
      console.error('No se pudo conectar:', err.message);
      socket.emit('tiktok-status', {
        ok: false,
        error: '¿Está el LIVE activo? Usuario: @' + user
      });
    }
  });

  // Cliente pide desconectar
  socket.on('disconnect-tiktok', () => {
    if (tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch(e) {}
      tiktokConnection = null;
      console.log('Desconectado manualmente');
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
