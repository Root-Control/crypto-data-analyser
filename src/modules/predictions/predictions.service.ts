import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RedisService } from '../../third-party-services/redis/redis.service';

@Injectable()
export class PredictionsService implements OnModuleInit {
  private readonly logger = new Logger(PredictionsService.name);
  private readonly PAIR = 'ETHUSDT';

  constructor(private readonly redisService: RedisService) {}

  onModuleInit() {
    this.logger.log('🚀 Initializing Predictions Service...');
    this.subscribeToAnalysisTopic();
  }

  private async subscribeToAnalysisTopic() {
    try {
      // Obtener el tópico desde .env o usar default
      const topicPrefix =
        process.env.READY_FOR_ANALYSIS_PREFIX_TOPIC || 'READY_FOR_ANALYSIS';
      const topic = `${topicPrefix}_${this.PAIR}`;

      this.logger.log(`📡 Subscribing to Redis topic: ${topic}`);

      // Suscribirse al tópico
      await this.redisService.subscribe(topic, (message) => {
        this.handleAnalysisMessage(message, topic);
      });

      this.logger.log(`✅ Successfully subscribed to topic: ${topic}`);
    } catch (error) {
      this.logger.error(
        `❌ Error subscribing to analysis topic: ${error.message}`,
      );
    }
  }

  private handleAnalysisMessage(message: string, topic: string) {
    try {
      this.logger.log(`📨 Received message on topic ${topic}:`);
      this.logger.log(`   Message: ${message}`);

      // Parsear el mensaje si es JSON
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(message);
        this.logger.log(`   Parsed data:`, parsedMessage);
      } catch {
        this.logger.log(`   Raw message (not JSON): ${message}`);
      }

      // Aquí puedes agregar lógica adicional para procesar el mensaje
      this.logger.log(`✅ Message processed successfully`);
    } catch (error) {
      this.logger.error(`❌ Error processing message: ${error.message}`);
    }
  }
}
