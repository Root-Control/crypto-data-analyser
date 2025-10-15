import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BinanceService {
  private readonly logger = new Logger(BinanceService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BINANCE_API_KEY');
    this.apiSecret = this.configService.get<string>('BINANCE_API_SECRET');
    this.baseUrl = this.configService.get<string>(
      'BINANCE_BASE_URL',
      'https://api.binance.com',
    );

    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn('⚠️ Binance API credentials not configured');
    }
  }

  /**
   * Ejecuta un trade en Binance basado en el setup de trading
   */
  async executeTrade(tradingSetup: {
    direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    entryPrice: number;
    takeProfitPrice: number;
    stopLossPrice: number;
    positionSize: number;
    leverage: number;
    capital: number;
    symbol?: string;
  }): Promise<{
    success: boolean;
    orderId?: string;
    message: string;
    error?: string;
  }> {
    try {
      // No ejecutar trade si es SIDEWAYS
      if (tradingSetup.direction === 'SIDEWAYS') {
        return {
          success: false,
          message: 'No trade executed - SIDEWAYS signal',
        };
      }

      // No ejecutar si no hay credenciales
      if (!this.apiKey || !this.apiSecret) {
        return {
          success: false,
          message: 'Binance API credentials not configured',
        };
      }

      const symbol = tradingSetup.symbol || 'ETHUSDT';

      this.logger.log(
        `🚀 Executing ${tradingSetup.direction} trade for ${symbol}`,
      );
      this.logger.log(`   Entry: $${tradingSetup.entryPrice.toFixed(2)}`);
      this.logger.log(
        `   Take Profit: $${tradingSetup.takeProfitPrice.toFixed(2)}`,
      );
      this.logger.log(
        `   Stop Loss: $${tradingSetup.stopLossPrice.toFixed(2)}`,
      );
      this.logger.log(
        `   Position Size: ${tradingSetup.positionSize.toFixed(4)} ETH`,
      );

      // 1. Configurar leverage
      await this.setLeverage(symbol, tradingSetup.leverage);

      // 2. Ejecutar orden principal (LIMIT en lugar de MARKET)
      const mainOrder = await this.placeOrder({
        symbol,
        side: tradingSetup.direction === 'UP' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        quantity: tradingSetup.positionSize.toFixed(4),
        price: tradingSetup.entryPrice.toFixed(2),
      });

      if (!mainOrder.success) {
        return {
          success: false,
          message: 'Failed to place main order',
          error: mainOrder.error,
        };
      }

      this.logger.log(`✅ Order placed successfully`);
      this.logger.log(`   Order ID: ${mainOrder.orderId}`);
      this.logger.log(`   Price: $${tradingSetup.entryPrice.toFixed(2)}`);
      this.logger.log(
        `   Quantity: ${tradingSetup.positionSize.toFixed(4)} ETH`,
      );
      this.logger.log(
        `   Status: PENDING (will execute when price reaches entry level)`,
      );
      this.logger.log(
        `   Take Profit: $${tradingSetup.takeProfitPrice.toFixed(2)} (place manually after fill)`,
      );
      this.logger.log(
        `   Stop Loss: $${tradingSetup.stopLossPrice.toFixed(2)} (place manually after fill)`,
      );

      return {
        success: true,
        orderId: mainOrder.orderId,
        message: `${tradingSetup.direction} order placed successfully (PENDING)`,
      };
    } catch (error) {
      this.logger.error(`❌ Error executing trade:`, error);
      return {
        success: false,
        message: 'Error executing trade',
        error: error.message,
      };
    }
  }

  /**
   * Configura el leverage para un símbolo
   */
  private async setLeverage(symbol: string, leverage: number): Promise<void> {
    try {
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

      if (!response.ok) {
        const error = await response.text();
        this.logger.warn(`⚠️ Failed to set leverage: ${error}`);
      }
    } catch (error) {
      this.logger.warn(`⚠️ Error setting leverage:`, error);
    }
  }

  /**
   * Coloca una orden limitada
   */
  private async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT';
    quantity: string;
    price: string;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${params.symbol}&side=${params.side}&type=${params.type}&quantity=${params.quantity}&price=${params.price}&timeInForce=GTC&timestamp=${timestamp}`;
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
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      return {
        success: true,
        orderId: result.orderId?.toString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Coloca una orden OCO (One-Cancels-Other) para TP/SL
   */
  private async placeOCOOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    price: string;
    stopPrice: string;
    stopLimitPrice: string;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${params.symbol}&side=${params.side}&quantity=${params.quantity}&price=${params.price}&stopPrice=${params.stopPrice}&stopLimitPrice=${params.stopLimitPrice}&stopLimitTimeInForce=GTC&timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await fetch(
        `${this.baseUrl}/fapi/v1/order/oco?${queryString}&signature=${signature}`,
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
        this.logger.warn(`⚠️ Failed to place OCO order: ${result.msg}`);
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      return {
        success: true,
        orderId: result.orderListId?.toString(),
      };
    } catch (error) {
      this.logger.warn(`⚠️ Error placing OCO order:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Crea la firma HMAC SHA256 para autenticación
   */
  private createSignature(queryString: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Verifica el estado de una orden
   */
  async checkOrderStatus(
    symbol: string,
    orderId: string,
  ): Promise<{
    success: boolean;
    status?: string;
    executedQty?: string;
    avgPrice?: string;
    error?: string;
  }> {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await fetch(
        `${this.baseUrl}/fapi/v1/order?${queryString}&signature=${signature}`,
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      return {
        success: true,
        status: result.status,
        executedQty: result.executedQty,
        avgPrice: result.avgPrice,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtiene las posiciones abiertas
   */
  async getOpenPositions(): Promise<{
    success: boolean;
    positions?: any[];
    error?: string;
  }> {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.createSignature(queryString);

      const response = await fetch(
        `${this.baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      // Filtrar solo posiciones con cantidad > 0
      const openPositions = result.filter(
        (pos: any) => parseFloat(pos.positionAmt) !== 0,
      );

      return {
        success: true,
        positions: openPositions,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Coloca Take Profit y Stop Loss después de que se ejecute la orden principal
   */
  async placeTPandSL(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    takeProfitPrice: string;
    stopLossPrice: string;
  }): Promise<{
    success: boolean;
    tpOrderId?: string;
    slOrderId?: string;
    error?: string;
  }> {
    try {
      this.logger.log(`📝 Placing TP/SL for filled position...`);

      // Take Profit (orden limitada)
      const tpOrder = await this.placeOrder({
        symbol: params.symbol,
        side: params.side,
        type: 'LIMIT',
        quantity: params.quantity,
        price: params.takeProfitPrice,
      });

      if (!tpOrder.success) {
        this.logger.warn(`⚠️ Failed to place Take Profit: ${tpOrder.error}`);
      }

      // Stop Loss (orden stop market)
      const slOrder = await this.placeStopOrder({
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity,
        stopPrice: params.stopLossPrice,
      });

      if (!slOrder.success) {
        this.logger.warn(`⚠️ Failed to place Stop Loss: ${slOrder.error}`);
      }

      if (tpOrder.success && slOrder.success) {
        this.logger.log(`✅ TP/SL placed successfully`);
        this.logger.log(`   TP Order ID: ${tpOrder.orderId}`);
        this.logger.log(`   SL Order ID: ${slOrder.orderId}`);
      }

      return {
        success: tpOrder.success && slOrder.success,
        tpOrderId: tpOrder.orderId,
        slOrderId: slOrder.orderId,
        error: !tpOrder.success ? tpOrder.error : slOrder.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Coloca una orden stop market
   */
  private async placeStopOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    stopPrice: string;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${params.symbol}&side=${params.side}&type=STOP_MARKET&quantity=${params.quantity}&stopPrice=${params.stopPrice}&timestamp=${timestamp}`;
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
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      return {
        success: true,
        orderId: result.orderId?.toString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtiene el balance de la cuenta
   */
  async getAccountBalance(): Promise<{
    success: boolean;
    balance?: number;
    error?: string;
  }> {
    try {
      if (!this.apiKey || !this.apiSecret) {
        return {
          success: false,
          error: 'API credentials not configured',
        };
      }

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
        return {
          success: false,
          error: result.msg || 'Unknown error',
        };
      }

      const usdtBalance = result.find((asset: any) => asset.asset === 'USDT');

      return {
        success: true,
        balance: usdtBalance ? parseFloat(usdtBalance.balance) : 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
