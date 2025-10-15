#!/usr/bin/env node

const https = require('https');

// Configuración - CAMBIAR ESTOS VALORES
const BINANCE_API_KEY = 'hbH1oqDxIW2YhFieYBoh9G8hp4iiSC0aAxfoA58tA4ZlkMClFB0Iu7RzMZXwD3QR';
const BINANCE_API_SECRET = 'sHmjFrm22sGhgOIzu4CKm4ttRNEiZcWnpZuAIMa1pXQkIQdCfuHikiq388YiBonw';
const BINANCE_BASE_URL = 'https://fapi.binance.com';

// Parámetros de prueba
const SYMBOL = 'ETHUSDT';
const ENTRY_PRICE = 3956; // Precio de entrada
const TAKE_PROFIT_PRICE = ENTRY_PRICE + 1; // Take Profit (+$1)
const STOP_LOSS_PRICE = ENTRY_PRICE - 1; // Stop Loss (-$1)
const CAPITAL = 25; // Capital en USDT (mínimo $20 requerido)
const LEVERAGE = 1; // Sin apalancamiento

class TradeTestClose {
  constructor() {
    this.apiKey = BINANCE_API_KEY;
    this.apiSecret = BINANCE_API_SECRET;
    this.baseUrl = BINANCE_BASE_URL;
    
    if (!this.apiKey || !this.apiSecret || this.apiKey === 'TU_API_KEY_AQUI') {
      console.log('❌ Error: Configura tu API Key y Secret en el archivo');
      console.log('   Edita las variables BINANCE_API_KEY y BINANCE_API_SECRET');
      process.exit(1);
    }
  }

  /**
   * Crea la firma HMAC SHA256 para autenticación
   */
  createSignature(queryString) {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Obtiene el balance de la cuenta
   */
  async getAccountBalance() {
    try {
      console.log(`💰 Obteniendo balance de cuenta...`);
      
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await fetch(
        `${this.baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`,
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        console.log(`❌ Error obteniendo balance: ${result.msg}`);
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      const usdtBalance = result.find((asset) => asset.asset === 'USDT');
      const ethBalance = result.find((asset) => asset.asset === 'ETH');

      console.log(`✅ Balance obtenido:`);
      console.log(`   USDT: ${usdtBalance ? parseFloat(usdtBalance.balance).toFixed(2) : '0.00'}`);
      console.log(`   ETH: ${ethBalance ? parseFloat(ethBalance.balance).toFixed(4) : '0.0000'}`);

      return {
        success: true,
        usdtBalance: usdtBalance ? parseFloat(usdtBalance.balance) : 0,
        ethBalance: ethBalance ? parseFloat(ethBalance.balance) : 0,
      };
    } catch (error) {
      console.log(`❌ Error obteniendo balance:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Cancela todas las órdenes abiertas para un símbolo
   */
  async cancelAllOrders(symbol) {
    try {
      console.log(`🗑️ Cancelando todas las órdenes para ${symbol}...`);
      
      const timestamp = Date.now();
      const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await fetch(
        `${this.baseUrl}/fapi/v1/allOpenOrders?${queryString}&signature=${signature}`,
        {
          method: 'DELETE',
          headers: {
            'X-MBX-APIKEY': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        console.log(`⚠️ Error cancelando órdenes: ${result.msg}`);
        return false;
      }

      console.log(`✅ Todas las órdenes canceladas para ${symbol}`);
      return true;
    } catch (error) {
      console.log(`❌ Error cancelando órdenes:`, error.message);
      return false;
    }
  }

  /**
   * Configura el leverage para un símbolo
   */
  async setLeverage(symbol, leverage) {
    try {
      console.log(`🔧 Configurando leverage ${leverage}x para ${symbol}...`);
      
      const timestamp = Date.now();
      const queryString = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await fetch(
        `${this.baseUrl}/fapi/v1/leverage?${queryString}&signature=${signature}`,
        {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        console.log(`⚠️ Error configurando leverage: ${result.msg}`);
        return false;
      }

      console.log(`✅ Leverage configurado: ${leverage}x`);
      return true;
    } catch (error) {
      console.log(`❌ Error configurando leverage:`, error.message);
      return false;
    }
  }

  /**
   * Coloca una orden limitada simple (sin TP/SL automático)
   */
  async placeLimitOrder(params) {
    try {
      console.log(`📝 Colocando orden limitada...`);
      console.log(`   Símbolo: ${params.symbol}`);
      console.log(`   Lado: ${params.side}`);
      console.log(`   Cantidad: ${params.quantity} ETH`);
      console.log(`   Precio: $${params.price}`);
      
      const timestamp = Date.now();
      const queryString = `symbol=${params.symbol}&side=${params.side}&type=LIMIT&quantity=${params.quantity}&price=${params.price}&timeInForce=GTC&timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await fetch(
        `${this.baseUrl}/fapi/v1/order?${queryString}&signature=${signature}`,
        {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        console.log(`❌ Error colocando orden: ${result.msg}`);
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      console.log(`✅ Orden limitada colocada`);
      console.log(`   Order ID: ${result.orderId}`);
      console.log(`   Precio: $${result.price}`);
      console.log(`   Cantidad: ${result.origQty} ETH`);
      console.log(`   Estado: ${result.status}`);

      return {
        success: true,
        orderId: result.orderId?.toString(),
        price: result.price,
        quantity: result.origQty,
        status: result.status,
      };
    } catch (error) {
      console.log(`❌ Error colocando orden:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Ejecuta un trade con TP/SL muy cerca
   */
  async executeCloseTrade() {
    try {
      console.log('🚀 INICIANDO TRADE CON TP/SL MUY CERCA');
      console.log('='.repeat(50));
      
      // Mostrar parámetros
      console.log('\n📊 PARÁMETROS DE PRUEBA:');
      console.log(`   Símbolo: ${SYMBOL}`);
      console.log(`   Precio entrada: $${ENTRY_PRICE}`);
      console.log(`   Take Profit: $${TAKE_PROFIT_PRICE} (+$${TAKE_PROFIT_PRICE - ENTRY_PRICE})`);
      console.log(`   Stop Loss: $${STOP_LOSS_PRICE} (-$${ENTRY_PRICE - STOP_LOSS_PRICE})`);
      console.log(`   Capital: $${CAPITAL}`);
      console.log(`   Leverage: ${LEVERAGE}x`);

      // 1. Obtener balance inicial
      console.log('\n1️⃣ Obteniendo balance inicial...');
      const balanceResult = await this.getAccountBalance();
      if (!balanceResult.success) {
        throw new Error('No se pudo obtener el balance');
      }

      // 2. Cancelar órdenes existentes
      console.log('\n2️⃣ Cancelando órdenes existentes...');
      await this.cancelAllOrders(SYMBOL);

      // 3. Configurar leverage
      console.log('\n3️⃣ Configurando leverage...');
      const leverageResult = await this.setLeverage(SYMBOL, LEVERAGE);
      if (!leverageResult) {
        throw new Error('No se pudo configurar el leverage');
      }

      // 4. Calcular parámetros del trade
      console.log('\n4️⃣ Calculando parámetros del trade...');
      const positionSize = CAPITAL / ENTRY_PRICE; // Sin leverage
      const roundedPositionSize = Math.floor(positionSize * 1000) / 1000;

      console.log(`   Position Size: ${roundedPositionSize.toFixed(3)} ETH`);
      console.log(`   Valor total: $${(roundedPositionSize * ENTRY_PRICE).toFixed(2)}`);

      // 5. Ejecutar orden limitada simple
      console.log('\n5️⃣ Ejecutando orden limitada...');
      const limitOrder = await this.placeLimitOrder({
        symbol: SYMBOL,
        side: 'BUY',
        quantity: roundedPositionSize.toFixed(3),
        price: ENTRY_PRICE.toFixed(2),
      });

      if (!limitOrder.success) {
        throw new Error(`Error ejecutando orden: ${limitOrder.error}`);
      }

      // 6. Mostrar resumen final
      console.log('\n✅ ORDEN LIMITADA COMPLETADA');
      console.log('='.repeat(50));
      console.log(`   Order ID: ${limitOrder.orderId}`);
      console.log(`   Precio entrada: $${limitOrder.price}`);
      console.log(`   Cantidad: ${limitOrder.quantity} ETH`);
      console.log(`   Estado: ${limitOrder.status}`);

      console.log('\n💡 IMPORTANTE:');
      console.log('   - Orden pendiente a $3945');
      console.log('   - Se ejecutará cuando ETH toque $3945');
      console.log('   - DESPUÉS de ejecutarse, coloca TP/SL manualmente');
      console.log('   - TP sugerido: $3946 (+$1)');
      console.log('   - SL sugerido: $3944 (-$1)');

    } catch (error) {
      console.log('\n❌ ERROR EN TRADE:');
      console.log(`   ${error.message}`);
      console.log('\n💡 Verifica:');
      console.log('   - API Key y Secret correctos');
      console.log('   - Permisos de trading habilitados');
      console.log('   - Balance suficiente en la cuenta');
    }
  }
}

// Función principal
async function main() {
  console.log('🤖 BINANCE TRADE TEST CERCA - ETHUSDT');
  console.log('=====================================');
  console.log('💰 Entrada: $3944 | TP: $3945 | SL: $3943');
  console.log('=====================================');
  
  const tradeTest = new TradeTestClose();
  await tradeTest.executeCloseTrade();
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { TradeTestClose };
