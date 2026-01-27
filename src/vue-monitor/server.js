const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Хранилище данных
let botsData = [];
let lastUpdate = Date.now();

// Эндпоинт для получения данных
app.get('/api/bots', (req, res) => {
  res.json({
    success: true,
    timestamp: lastUpdate,
    count: botsData.length,
    bots: botsData
  });
});

// Эндпоинт для обновления данных (из Adventure Land)
app.post('/api/update-bots', (req, res) => {
  try {
    botsData = req.body.bots || [];
    lastUpdate = Date.now();
    
    console.log(`Обновлены данные ${botsData.length} ботов`);
    
    res.json({ 
      success: true, 
      received: botsData.length,
      timestamp: lastUpdate
    });
  } catch (error) {
    console.error('Ошибка обновления:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Статический сервер для Vue приложения
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 API доступен по: http://localhost:${PORT}/api/bots`);
});