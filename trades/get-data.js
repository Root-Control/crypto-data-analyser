const redis = require('redis');
const axios = require('axios');
require('dotenv').config();

class DataManager {
  constructor() {
    this.redisClient = null;
    this.isConnected = false;
  }

  /**
   * Conecta a Redis
   */
  async connect() {
    try {
      console.log('🔌 Conectando a Redis...');
      
      this.redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('❌ Redis server refused connection');
            return new Error('Redis server refused connection');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error('❌ Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            console.error('❌ Redis max retry attempts reached');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Conectado a Redis');
        this.isConnected = true;
      });

      this.redisClient.on('error', (err) => {
        console.error('❌ Error de Redis:', err);
        this.isConnected = false;
      });

      this.redisClient.on('end', () => {
        console.log('🔌 Conexión a Redis cerrada');
        this.isConnected = false;
      });

      await this.redisClient.connect();
      
    } catch (error) {
      console.error('❌ Error al conectar a Redis:', error);
      throw error;
    }
  }

  /**
   * Desconecta de Redis
   */
  async disconnect() {
    if (this.redisClient && this.isConnected) {
      try {
        await this.redisClient.quit();
        console.log('🔌 Desconectado de Redis');
      } catch (error) {
        console.error('❌ Error al desconectar de Redis:', error);
      }
    }
  }

  /**
   * Verifica si Redis está conectado
   */
  isRedisConnected() {
    return this.isConnected && this.redisClient;
  }

  /**
   * Obtiene datos de Redis
   */
  async get(key) {
    if (!this.isRedisConnected()) {
      throw new Error('Redis no está conectado');
    }
    
    try {
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Error al obtener datos de Redis:', error);
      throw error;
    }
  }

  /**
   * Guarda datos en Redis
   */
  async set(key, value, expireSeconds = null) {
    if (!this.isRedisConnected()) {
      throw new Error('Redis no está conectado');
    }
    
    try {
      const jsonValue = JSON.stringify(value);
      if (expireSeconds) {
        await this.redisClient.set(key, jsonValue, 'EX', expireSeconds);
      } else {
        await this.redisClient.set(key, jsonValue);
      }
      console.log(`💾 Datos guardados en Redis: ${key}`);
    } catch (error) {
      console.error('❌ Error al guardar datos en Redis:', error);
      throw error;
    }
  }

  /**
   * Elimina datos de Redis
   */
  async del(key) {
    if (!this.isRedisConnected()) {
      throw new Error('Redis no está conectado');
    }
    
    try {
      await this.redisClient.del(key);
      console.log(`🗑️ Datos eliminados de Redis: ${key}`);
    } catch (error) {
      console.error('❌ Error al eliminar datos de Redis:', error);
      throw error;
    }
  }

  /**
   * Obtiene todas las claves que coincidan con un patrón
   */
  async keys(pattern = '*') {
    if (!this.isRedisConnected()) {
      throw new Error('Redis no está conectado');
    }
    
    try {
      return await this.redisClient.keys(pattern);
    } catch (error) {
      console.error('❌ Error al obtener claves de Redis:', error);
      throw error;
    }
  }

  /**
   * Obtiene información del estado de Redis
   */
  async getInfo() {
    if (!this.isRedisConnected()) {
      throw new Error('Redis no está conectado');
    }
    
    try {
      const info = await this.redisClient.info();
      return info;
    } catch (error) {
      console.error('❌ Error al obtener información de Redis:', error);
      throw error;
    }
  }

  /**
   * Obtiene el número de velas almacenadas
   */
  async getCandleCount() {
    try {
      const keys = await this.keys('candle:*');
      return keys.length;
    } catch (error) {
      console.error('❌ Error al contar velas:', error);
      return 0;
    }
  }

  /**
   * Obtiene las últimas N velas
   */
  async getLastCandles(count = 10) {
    try {
      const keys = await this.keys('candle:*');
      const sortedKeys = keys.sort((a, b) => {
        const aIndex = parseInt(a.split(':')[1]);
        const bIndex = parseInt(b.split(':')[1]);
        return bIndex - aIndex; // Orden descendente (más recientes primero)
      });
      
      const lastKeys = sortedKeys.slice(0, count);
      const candles = [];
      
      for (const key of lastKeys) {
        const candle = await this.get(key);
        if (candle) {
          candles.push(candle);
        }
      }
      
      return candles;
    } catch (error) {
      console.error('❌ Error al obtener últimas velas:', error);
      return [];
    }
  }

  /**
   * Obtiene todas las velas almacenadas
   */
  async getAllCandles() {
    try {
      const keys = await this.keys('candle:*');
      const sortedKeys = keys.sort((a, b) => {
        const aIndex = parseInt(a.split(':')[1]);
        const bIndex = parseInt(b.split(':')[1]);
        return aIndex - bIndex; // Orden ascendente (más antiguas primero)
      });
      
      const candles = [];
      
      for (const key of sortedKeys) {
        const candle = await this.get(key);
        if (candle) {
          candles.push(candle);
        }
      }
      
      return candles;
    } catch (error) {
      console.error('❌ Error al obtener todas las velas:', error);
      return [];
    }
  }

  /**
   * Obtiene velas en un rango específico
   */
  async getCandlesInRange(startIndex, endIndex) {
    try {
      const keys = await this.keys('candle:*');
      const candles = [];
      
      for (let i = startIndex; i <= endIndex; i++) {
        const key = `candle:${i}`;
        if (keys.includes(key)) {
          const candle = await this.get(key);
          if (candle) {
            candles.push(candle);
          }
        }
      }
      
      return candles;
    } catch (error) {
      console.error('❌ Error al obtener velas en rango:', error);
      return [];
    }
  }

  /**
   * Busca velas por timestamp
   */
  async getCandlesByTimestamp(startTime, endTime) {
    try {
      const allCandles = await this.getAllCandles();
      return allCandles.filter(candle => {
        const candleTime = new Date(candle.timestamp).getTime();
        return candleTime >= startTime && candleTime <= endTime;
      });
    } catch (error) {
      console.error('❌ Error al buscar velas por timestamp:', error);
      return [];
    }
  }

  /**
   * Obtiene velas de ETH/USDT desde Redis o API de Binance
   * @param {string} symbol - Símbolo del par (default: ETHUSDT)
   * @param {string} interval - Intervalo de tiempo (default: 1m)
   * @param {number} limit - Número de velas a obtener (default: 1000)
   * @param {boolean} use100K - Flag para usar 100K velas (default: false)
   * @returns {Array} Array de velas
   */
  async getCandles(symbol = 'ETHUSDT', interval = '1m', limit = 1000, use100K = false) {
    // Si use100K es true, usar la key de 100K velas
    if (use100K) {
      console.log('🚀 Modo 100K activado - usando datos históricos permanentes');
      return await this.get100KCandles();
    }
    
    const cacheKey = `${symbol}_${interval.toUpperCase()}_${limit}_CANDLES`;
    
    try {
      // Primero verificar si hay datos en Redis
      console.log(`🔍 Verificando datos en Redis para ${cacheKey}...`);
      const cachedData = await this.get(cacheKey);
      
      if (cachedData && cachedData.length > 0) {
        console.log(`✅ Datos encontrados en Redis: ${cachedData.length} velas`);
        return cachedData;
      }
      
      // Si no hay datos en Redis, obtener de la API de Binance
      console.log(`📡 Obteniendo datos de la API de Binance para ${symbol}...`);
      const apiData = await this.fetchCandlesFromBinance(symbol, interval, limit);
      
      if (apiData && apiData.length > 0) {
        // Guardar en Redis para futuras consultas
        console.log(`💾 Guardando ${apiData.length} velas en Redis...`);
        await this.set(cacheKey, apiData, 3600); // Expira en 1 hora
        
        // También guardar individualmente para compatibilidad con el sistema existente
        for (let i = 0; i < apiData.length; i++) {
          await this.set(`candle:${i}`, apiData[i]);
        }
        
        console.log(`✅ ${apiData.length} velas guardadas en Redis`);
        return apiData;
      } else {
        console.log('❌ No se pudieron obtener datos de la API');
        return [];
      }
      
    } catch (error) {
      console.error('❌ Error en getCandles:', error);
      return [];
    }
  }

  /**
   * Obtiene velas desde la API de Binance Futures
   * @param {string} symbol - Símbolo del par
   * @param {string} interval - Intervalo de tiempo
   * @param {number} limit - Número de velas
   * @returns {Array} Array de velas formateadas
   */
  async fetchCandlesFromBinance(symbol, interval, limit) {
    try {
      const baseUrl = 'https://fapi.binance.com';
      const endpoint = '/fapi/v1/klines';
      
      const params = {
        symbol: symbol,
        interval: interval,
        limit: limit
      };
      
      console.log(`🌐 Llamando a Binance API: ${baseUrl}${endpoint}`);
      console.log(`📊 Parámetros:`, params);
      
      const response = await axios.get(`${baseUrl}${endpoint}`, { params });
      
      if (response.status === 200 && response.data) {
        console.log(`📈 Respuesta recibida: ${response.data.length} velas`);
        
        // Formatear las velas al formato esperado
        const formattedCandles = response.data.map((candle, index) => ({
          index: index,
          timestamp: new Date(candle[0]).toISOString(),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
          closeTime: new Date(candle[6]).toISOString(),
          quoteAssetVolume: parseFloat(candle[7]),
          numberOfTrades: parseInt(candle[8]),
          takerBuyBaseAssetVolume: parseFloat(candle[9]),
          takerBuyQuoteAssetVolume: parseFloat(candle[10])
        }));
        
        return formattedCandles;
      } else {
        throw new Error(`API response error: ${response.status}`);
      }
      
    } catch (error) {
      console.error('❌ Error al obtener datos de Binance:', error.message);
      if (error.response) {
        console.error('📊 Respuesta de error:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Obtiene 100K velas desde la key histórica permanente
   * @returns {Array} Array de 100K velas
   */
  async get100KCandles() {
    try {
      console.log('🔍 Obteniendo 100K velas desde ETHUSD_HISTORICAL_CANDLES_PERMANENT...');
      
      // Intentar obtener desde Redis
      const redisData = await this.get('ETHUSD_HISTORICAL_CANDLES_PERMANENT');
      
      if (redisData && typeof redisData === 'string') {
        console.log('✅ Datos encontrados en Redis');
        const candles = JSON.parse(redisData);
        console.log(`📊 Cargadas ${candles.length} velas desde Redis`);
        return candles.slice(0, 100000); // Asegurar máximo 100K
      } else if (redisData && Array.isArray(redisData)) {
        console.log('✅ Datos encontrados en Redis (ya parseados)');
        console.log(`📊 Cargadas ${redisData.length} velas desde Redis`);
        return redisData.slice(0, 100000); // Asegurar máximo 100K
      } else {
        console.log('❌ No se encontraron datos en Redis para la key temporal');
        console.log('💡 Usando datos de 1000 velas como fallback');
        return await this.getCandles('ETHUSDT', '15m', 1000, false);
      }
    } catch (error) {
      console.error('❌ Error obteniendo 100K velas:', error);
      console.log('💡 Usando datos de 1000 velas como fallback');
      return await this.getCandles('ETHUSDT', '15m', 1000, false);
    }
  }

  /**
   * Limpia la caché de velas
   */
  async clearCandlesCache() {
    try {
      const keys = await this.keys('*_CANDLES');
      for (const key of keys) {
        await this.del(key);
      }
      console.log(`🗑️ Caché de velas limpiada: ${keys.length} claves eliminadas`);
    } catch (error) {
      console.error('❌ Error al limpiar caché:', error);
    }
  }
}

// Función principal para probar la conexión
async function main() {
  const dataManager = new DataManager();
  
  try {
    // Conectar a Redis
    await dataManager.connect();
    
    // Esperar un poco para que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verificar conexión
    if (dataManager.isRedisConnected()) {
      console.log('🎉 ¡Conexión a Redis exitosa!');
      
      // Probar la función getCandles con 1000 velas (modo normal)
      console.log('\n🧪 Probando función getCandles (1000 velas)...');
      const candles = await dataManager.getCandles('ETHUSDT', '15m', 1000, false);
      
      if (candles.length > 0) {
        console.log(`✅ Obtenidas ${candles.length} velas de ETH/USDT (modo normal)`);
        console.log('📋 Ejemplo de vela:');
        console.log(JSON.stringify(candles[0], null, 2));
        
        // Mostrar estadísticas básicas
        const prices = candles.map(c => c.close);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        
        console.log('\n📊 Estadísticas de precios (1000 velas):');
        console.log(`- Precio mínimo: $${minPrice.toFixed(2)}`);
        console.log(`- Precio máximo: $${maxPrice.toFixed(2)}`);
        console.log(`- Precio promedio: $${avgPrice.toFixed(2)}`);
        console.log(`- Rango: $${(maxPrice - minPrice).toFixed(2)}`);
        
      } else {
        console.log('❌ No se pudieron obtener velas (modo normal)');
      }
      
      // Probar la función getCandles con 100K velas (modo 100K)
      console.log('\n🧪 Probando función getCandles (100K velas)...');
      const candles100K = await dataManager.getCandles('ETHUSDT', '15m', 1000, true);
      
      if (candles100K.length > 0) {
        console.log(`✅ Obtenidas ${candles100K.length} velas de ETH/USDT (modo 100K)`);
        
        // Mostrar estadísticas básicas
        const prices100K = candles100K.map(c => c.close);
        const minPrice100K = Math.min(...prices100K);
        const maxPrice100K = Math.max(...prices100K);
        const avgPrice100K = prices100K.reduce((a, b) => a + b, 0) / prices100K.length;
        
        console.log('\n📊 Estadísticas de precios (100K velas):');
        console.log(`- Precio mínimo: $${minPrice100K.toFixed(2)}`);
        console.log(`- Precio máximo: $${maxPrice100K.toFixed(2)}`);
        console.log(`- Precio promedio: $${avgPrice100K.toFixed(2)}`);
        console.log(`- Rango: $${(maxPrice100K - minPrice100K).toFixed(2)}`);
        
      } else {
        console.log('❌ No se pudieron obtener velas (modo 100K)');
      }
      
      // Obtener información básica de Redis
      const candleCount = await dataManager.getCandleCount();
      console.log(`\n📊 Total de velas en Redis: ${candleCount}`);
      
    } else {
      console.log('❌ No se pudo conectar a Redis');
    }
    
  } catch (error) {
    console.error('❌ Error en main:', error);
  } finally {
    // Desconectar
    await dataManager.disconnect();
  }
}

// Exportar la clase
module.exports = DataManager;

// Si se ejecuta directamente, correr main()
if (require.main === module) {
  main().catch(console.error);
}
