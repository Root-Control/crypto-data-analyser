import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { join } from 'path';

export const winstonConfig = WinstonModule.createLogger({
  transports: [
    // Console transport (para desarrollo)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, context, ...meta }) => {
            const contextStr = context ? `[${context}]` : '';
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} ${level} ${contextStr} ${message}${metaStr}`;
          },
        ),
      ),
    }),

    // File transport para todos los logs
    new winston.transports.File({
      filename: join(process.cwd(), 'logs', 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),

    // File transport solo para errores
    new winston.transports.File({
      filename: join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),

    // File transport específico para WebSocket
    new winston.transports.File({
      filename: join(process.cwd(), 'logs', 'websocket.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(
          ({ timestamp, level, message, context, ...meta }) => {
            const contextStr = context ? `[${context}]` : '';
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} ${level} ${contextStr} ${message}${metaStr}`;
          },
        ),
        // Filtro personalizado usando format
        winston.format((info) => {
          // Solo logs del WebSocket gateway
          const message = String(info.message || '');
          const isWebSocketLog = 
            info.context === 'BinanceWebSocketGateway' ||
            message.includes('WebSocket') ||
            message.includes('EVALUATING SIGNALS') ||
            message.includes('Found matching signal') ||
            message.includes('Telegram notification');
          
          return isWebSocketLog ? info : false;
        })(),
      ),
    }),
  ],
});
