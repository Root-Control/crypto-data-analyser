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

      // 2. Ejecutar orden principal
      const mainOrder = await this.placeOrder({
        symbol,
        side: tradingSetup.direction === 'UP' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: tradingSetup.positionSize.toFixed(4),
      });

      if (!mainOrder.success) {
        return {
          success: false,
          message: 'Failed to place main order',
          error: mainOrder.error,
        };
      }

      // 3. Colocar Take Profit (OCO Order)
      const tpOrder = await this.placeOCOOrder({
        symbol,
        side: tradingSetup.direction === 'UP' ? 'SELL' : 'BUY',
        quantity: tradingSetup.positionSize.toFixed(4),
        price: tradingSetup.takeProfitPrice.toFixed(2),
        stopPrice: tradingSetup.stopLossPrice.toFixed(2),
        stopLimitPrice: tradingSetup.stopLossPrice.toFixed(2),
      });

      this.logger.log(`✅ Trade executed successfully`);
      this.logger.log(`   Main Order ID: ${mainOrder.orderId}`);
      if (tpOrder.success) {
        this.logger.log(`   OCO Order ID: ${tpOrder.orderId}`);
      }

      return {
        success: true,
        orderId: mainOrder.orderId,
        message: `${tradingSetup.direction} trade executed successfully`,
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
   * Coloca una orden de mercado
   */
  private async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET';
    quantity: string;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${params.symbol}&side=${params.side}&type=${params.type}&quantity=${params.quantity}&timestamp=${timestamp}`;
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
